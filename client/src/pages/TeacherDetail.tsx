import React, { useEffect } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { UserRound } from "lucide-react";
import { AppDispatch, RootState } from "../redux/store";
import { fetchTeachers, Teacher } from "../redux/slices/teacherSlice";
import { Badge, Button, Card, DetailList, EmptyState, Page, PageHeader, formatDate } from "@/components/ui";
import { CardLoading } from "@/components/exmcl/ExmclUi";

const TeacherDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const dispatch = useDispatch<AppDispatch>();
  const { teachers, loading } = useSelector((state: RootState) => state.teachers);

  useEffect(() => {
    if (!teachers || teachers.length === 0) {
      dispatch(fetchTeachers({}));
    }
  }, [dispatch, teachers]);

  const teacher = teachers?.find((t: Teacher) => t._id === id || t.id === id);
  const listPath = location.pathname.startsWith("/exmcl") ? "/exmcl/exam-functionaries" : "/teachers";

  if (loading) {
    return (
      <Page>
        <Card>
          <CardLoading label="Loading exam functionary…" />
        </Card>
      </Page>
    );
  }

  if (!teacher) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon={UserRound}
            title="This exam functionary isn’t on the list"
            body="They may have been removed, or the link is out of date."
            action={
              <Button size="sm" onClick={() => navigate(listPath)}>
                Back to exam functionaries
              </Button>
            }
          />
        </Card>
      </Page>
    );
  }

  const active = Boolean(teacher.isActive || teacher.status === "active");
  const subjects = (teacher.subjects || []).map((subject: any) =>
    typeof subject === "string" ? subject : subject.name || subject.code || "Unknown"
  );

  return (
    <Page>
      <PageHeader
        title={teacher.name}
        subtitle={[teacher.designation, teacher.employeeId ? `OASIS ID ${teacher.employeeId}` : ""].filter(Boolean).join(" · ")}
        actions={active ? <Badge tone="success">Active</Badge> : <Badge tone="neutral">Inactive</Badge>}
      />

      <div className="cb-grid-6-6">
        <Card title="Contact and school">
          <DetailList
            columns={1}
            items={[
              { label: "Email", value: (teacher.email || "").trim() },
              {
                label: "School",
                value: teacher.schoolName || teacher.schoolCode
                  ? `${teacher.schoolName || "—"}${teacher.schoolCode ? ` (${teacher.schoolCode})` : ""}`
                  : "",
              },
              { label: "Date of birth", value: teacher.dateOfBirth ? formatDate(teacher.dateOfBirth) : "" },
            ]}
          />
        </Card>

        <Card title="Professional and bank">
          <DetailList
            items={[
              { label: "School code", value: teacher.schoolCode },
              { label: "Subject code", value: teacher.subjectCode },
              { label: "Bank", value: teacher.bankName },
              { label: "Account number", value: teacher.accountNumber },
              { label: "IFSC", value: teacher.ifscCode },
            ]}
          />
        </Card>

        <Card title="Subjects taught">
          {subjects.length ? (
            <p>{subjects.join(", ")}</p>
          ) : (
            <p className="cb-muted">No subjects assigned.</p>
          )}
        </Card>

        {teacher.emergencyContact ? (
          <Card title="Emergency contact">
            <DetailList
              columns={1}
              items={[
                { label: "Name", value: teacher.emergencyContact.name },
                { label: "Phone", value: teacher.emergencyContact.phone },
                { label: "Relation", value: teacher.emergencyContact.relation },
              ]}
            />
          </Card>
        ) : null}
      </div>
    </Page>
  );
};

export default TeacherDetail;
