import { useLocalSearchParams, usePreventRemove, useRouter } from "expo-router";
import { UserPlus } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";

import { ApiError } from "@/lib/api";
import { classLabel } from "@/lib/format";
import { CardSkeleton } from "@/portal/states";
import type {
  CredentialMethod,
  Delivery,
  Login,
  LoginKind,
  StaffCandidate,
  StudentCandidate,
} from "@/services/usersService";
import { CredentialResult } from "@/staff/CredentialResult";
import {
  useCreateLogin,
  useRoles,
  useStaffCandidates,
  useStudentCandidates,
} from "@/staff/userQueries";
import { space } from "@/theme/tokens";
import {
  ActionBar,
  ActionSheet,
  BottomSheet,
  Callout,
  ListGroup,
  MobileScreen,
  MobileTextField,
  NavBar,
  OptionList,
  SearchBar,
  SegmentedControl,
  StatusView,
  haptic,
} from "@/ui";

const RELATIONS = ["Mother", "Father", "Guardian"];

/**
 * Create a login: staff (email, roles, their staff record), a parent (email, their children) or a
 * student (their record; the login ID is the admission number). They get an emailed invite, or a
 * temporary password to hand over (shown once).
 */
export default function NewLoginScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: LoginKind }>();
  const [kind, setKind] = useState<LoginKind>(
    params.kind === "parent" || params.kind === "student"
      ? params.kind
      : "staff",
  );
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [teacher, setTeacher] = useState<StaffCandidate | null>(null);
  const [children, setChildren] = useState<StudentCandidate[]>([]);
  const [relation, setRelation] = useState("Mother");
  const [method, setMethod] = useState<CredentialMethod>("invite");
  const [sheet, setSheet] = useState<
    "roles" | "staff" | "student" | "relation" | null
  >(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<({ user: Login } & Delivery) | null>(
    null,
  );
  const [leaving, setLeaving] = useState<null | (() => void)>(null);

  const allRoles = useRoles(kind === "staff");
  const staffList = useStaffCandidates(query.trim(), sheet === "staff");
  const studentList = useStudentCandidates(query.trim(), sheet === "student");
  const create = useCreateLogin();
  const dirty =
    !created && Boolean(name || email || children.length || teacher);
  const allowLeaving = usePreventRemove(
    dirty && !create.isPending,
    ({ repeat }) => setLeaving(() => repeat),
  );

  const pickTeacher = (row: StaffCandidate) => {
    setTeacher(row);
    if (!name) setName(row.name);
    if (!email && row.email) setEmail(row.email);
    if (!roles.length && row.suggestedRole) setRoles([row.suggestedRole]);
    setSheet(null);
    setQuery("");
  };

  const pickStudent = (row: StudentCandidate) => {
    if (kind === "student") {
      setChildren([row]);
      setName(row.name);
    } else {
      setChildren((current) =>
        current.some((child) => child._id === row._id)
          ? current
          : [...current, row],
      );
      if (!email && row.guardianEmail) setEmail(row.guardianEmail);
      if (!name && row.guardianName) setName(row.guardianName);
    }
    setSheet(null);
    setQuery("");
  };

  const submit = async () => {
    const needsEmail = kind !== "student";
    if (needsEmail && !/^\S+@\S+\.\S+$/.test(email.trim()))
      return fail("Enter their email address: it is how they sign in.");
    if (kind === "staff" && !roles.length)
      return fail("Choose at least one role.");
    if (kind !== "staff" && !children.length)
      return fail(
        kind === "parent" ? "Add at least one child." : "Choose the student.",
      );
    if (method === "invite" && !email.trim())
      return fail(
        "An invite needs an email address. Make a temporary password instead.",
      );
    setError(null);
    try {
      const result = await create.mutateAsync({
        kind,
        name: name.trim(),
        email: email.trim() || undefined,
        ...(kind === "staff" ? { roles, teacherId: teacher?._id } : {}),
        ...(kind !== "staff"
          ? {
              students: children.map((child) => ({
                studentId: child._id,
                relation: kind === "parent" ? relation : "",
              })),
            }
          : {}),
        credential: { method },
      });
      haptic.success();
      allowLeaving();
      setCreated(result);
    } catch (failure) {
      haptic.error();
      setError(
        failure instanceof ApiError
          ? failure.message
          : "The login wasn't created. Check your connection and try again.",
      );
    }
  };

  function fail(message: string) {
    haptic.error();
    setError(message);
  }

  if (created) {
    return (
      <MobileScreen
        nav={
          <NavBar
            title="Login created"
            back={{ label: "Users", onPress: router.back }}
          />
        }
      >
        <CredentialResult
          delivery={created}
          name={created.user.name.split(" ")[0]}
          loginId={created.user.loginId}
          onDone={() => router.back()}
        />
      </MobileScreen>
    );
  }

  return (
    <MobileScreen
      nav={
        <NavBar
          title="Create a login"
          back={{ label: "Users", onPress: router.back }}
        />
      }
      actionBar={
        <ActionBar
          icon={UserPlus}
          summary={name.trim() || "New login"}
          detail={
            method === "invite" ? "Invite by email" : "Temporary password"
          }
          label={create.isPending ? "Creating…" : "Create login"}
          onPress={submit}
        />
      }
      overlay={
        <>
          <BottomSheet
            open={sheet !== null}
            onClose={() => setSheet(null)}
            detent="large"
            title={
              sheet === "roles"
                ? "Roles"
                : sheet === "staff"
                  ? "Staff record"
                  : sheet === "relation"
                    ? "Relation"
                    : "Student"
            }
          >
            {sheet === "roles" ? (
              <OptionList
                multiple
                label="Roles"
                value={roles}
                onChange={setRoles}
                options={(allRoles.data ?? []).map((role) => ({
                  value: role.key,
                  label: role.name,
                  meta: role.description,
                }))}
              />
            ) : sheet === "relation" ? (
              <OptionList
                label="Relation"
                value={relation}
                onChange={(value) => {
                  setRelation(value);
                  setSheet(null);
                }}
                options={RELATIONS.map((value) => ({ value, label: value }))}
              />
            ) : (
              <View style={{ gap: space["space-3"] }}>
                <SearchBar
                  label="Search"
                  placeholder={
                    sheet === "staff" ? "Search staff" : "Search students"
                  }
                  value={query}
                  onChange={setQuery}
                  onCancel={() => setQuery("")}
                />
                {sheet === "staff" ? (
                  staffList.isPending ? (
                    <CardSkeleton rows={3} />
                  ) : (
                    <ListGroup
                      items={(staffList.data ?? []).map((row) => ({
                        title: row.name,
                        subtitle:
                          [
                            row.designation,
                            row.hasLogin ? "Already has a login" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || undefined,
                        onPress: row.hasLogin
                          ? undefined
                          : () => pickTeacher(row),
                      }))}
                    />
                  )
                ) : query.trim().length < 2 ? (
                  <StatusView
                    compact
                    kind="empty"
                    title="Type at least two letters"
                    body="Search by name or admission number."
                  />
                ) : (
                  <ListGroup
                    items={(studentList.data ?? []).map((row) => {
                      const taken =
                        kind === "student" ? row.hasStudentLogin : false;
                      return {
                        title: row.name,
                        subtitle: [
                          classLabel(row.className, row.section),
                          row.rollNumber,
                          taken
                            ? "Already has a login"
                            : kind === "parent" && row.hasParentLogin
                              ? "A parent already has a login"
                              : null,
                        ]
                          .filter(Boolean)
                          .join(" · "),
                        lines: 2,
                        onPress: taken ? undefined : () => pickStudent(row),
                      };
                    })}
                  />
                )}
              </View>
            )}
          </BottomSheet>
          <ActionSheet
            open={Boolean(leaving)}
            onClose={() => setLeaving(null)}
            title="Discard this login?"
            message="It hasn't been created."
            actions={[
              { label: "Discard", tone: "danger", onSelect: () => leaving?.() },
            ]}
            cancelLabel="Keep going"
          />
        </>
      }
    >
      {error ? (
        <Callout tone="danger" title="Not created">
          {error}
        </Callout>
      ) : null}
      <SegmentedControl
        label="Kind of login"
        value={kind}
        onChange={(next) => {
          setKind(next);
          setChildren([]);
          setTeacher(null);
          if (next === "student") setMethod("temporary");
        }}
        options={[
          { value: "staff", label: "Staff" },
          { value: "parent", label: "Parent" },
          { value: "student", label: "Student" },
        ]}
      />
      {kind === "staff" ? (
        <ListGroup
          items={[
            {
              title: "Staff record",
              value: teacher?.name ?? "Choose",
              onPress: () => setSheet("staff"),
            },
            {
              title: "Roles",
              value: roles.length
                ? (allRoles.data ?? [])
                    .filter((role) => roles.includes(role.key))
                    .map((role) => role.name)
                    .join(", ") || `${roles.length} chosen`
                : "Choose",
              onPress: () => setSheet("roles"),
            },
          ]}
        />
      ) : (
        <ListGroup
          header={kind === "parent" ? "Children" : "Student"}
          items={[
            ...children.map((child) => ({
              title: child.name,
              subtitle: classLabel(child.className, child.section),
              onPress:
                kind === "parent"
                  ? () =>
                      setChildren((current) =>
                        current.filter((row) => row._id !== child._id),
                      )
                  : () => setSheet("student"),
            })),
            ...(kind === "parent" || !children.length
              ? [
                  {
                    title:
                      kind === "parent" ? "Add a child" : "Choose the student",
                    onPress: () => setSheet("student"),
                  },
                ]
              : []),
            ...(kind === "parent"
              ? [
                  {
                    title: "Relation",
                    value: relation,
                    onPress: () => setSheet("relation"),
                  },
                ]
              : []),
          ]}
          footer={
            kind === "parent" && children.length
              ? "Tap a child to take them off."
              : undefined
          }
        />
      )}
      <View style={{ gap: space["space-4"] }}>
        <MobileTextField
          label="Name"
          value={name}
          onChangeText={setName}
          maxLength={120}
          autoCapitalize="words"
        />
        {kind !== "student" ? (
          <MobileTextField
            label="Email"
            type="email"
            value={email}
            onChangeText={setEmail}
            hint="They sign in with this."
            maxLength={120}
          />
        ) : null}
      </View>
      {kind === "student" ? null : (
        <SegmentedControl
          label="How they get in"
          value={method}
          onChange={setMethod}
          options={[
            { value: "invite", label: "Email an invite" },
            { value: "temporary", label: "Password now" },
          ]}
        />
      )}
    </MobileScreen>
  );
}
