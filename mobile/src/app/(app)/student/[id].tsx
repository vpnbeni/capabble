import { useLocalSearchParams, useRouter } from 'expo-router'
import { Award, FileText, IdCard, Pencil, Phone } from 'lucide-react-native'
import { useState } from 'react'
import { Linking, View } from 'react-native'

import { ApiError } from '@/lib/api'
import { classLabel, formatDate } from '@/lib/format'
import { sharePdf } from '@/lib/sharePdf'
import { CardSkeleton, LoadFailed } from '@/portal/states'
import { examService } from '@/services/examService'
import { studentService } from '@/services/studentService'
import { useExams, useStudentRecord } from '@/staff/queries'
import { useStaff } from '@/staff/useStaff'
import { space } from '@/theme/tokens'
import { ActionSheet, Avatar, DetailList, ListGroup, MobileButton, MobileScreen, NavBar, Surface, Text, haptic, useToast, type ListGroupItem } from '@/ui'

const call = (phone: string, name: string) => (
  <MobileButton variant="tinted" size="medium" icon={Phone} aria-label={`Call ${name}`} onPress={() => Linking.openURL(`tel:${phone.replace(/\s+/g, '')}`)} />
)

/**
 * A student's record for staff, with the family to call, their documents and ID card. The office
 * (student records write) edits it from here.
 */
export default function StudentScreen() {
  const router = useRouter()
  const toast = useToast()
  const staff = useStaff()
  const { id } = useLocalSearchParams<{ id: string }>()
  const record = useStudentRecord(id)
  const data = record.data
  const canEdit = staff.can('stdnt.students.write')
  const canCard = staff.canUse('stdnt_id_cards') && staff.can('stdnt.idcards.write')
  const [sharing, setSharing] = useState(false)
  const canReport = staff.canUse('exmcl_report_card') && staff.can('exam.results.read')
  const exams = useExams(canReport)
  const examList = exams.data ?? []
  const [picking, setPicking] = useState(false)

  const shareReport = async (examId: string, examName: string) => {
    if (!data || sharing) return
    setPicking(false)
    setSharing(true)
    try {
      const bytes = await examService.reportCard(examId, data._id)
      await sharePdf(bytes, `report-card-${examName}-${data.name}.pdf`.replace(/[^\w.-]+/g, '-'))
    } catch (error) {
      haptic.error()
      toast(error instanceof ApiError ? error.message : "Couldn't make the report card. Try again.", 'danger')
    } finally {
      setSharing(false)
    }
  }

  const shareCard = async () => {
    if (!data || sharing) return
    setSharing(true)
    try {
      const bytes = await studentService.idCard(data._id)
      haptic.success()
      await sharePdf(bytes, `id-card-${data.name.replace(/[^\w-]+/g, '-')}.pdf`)
    } catch (error) {
      haptic.error()
      toast(error instanceof ApiError ? error.message : "Couldn't make the ID card. Try again.", 'danger')
    } finally {
      setSharing(false)
    }
  }

  const family: ListGroupItem[] = data
    ? [
        ...(data.guardianName || data.guardianPhone
          ? [
              {
                title: data.guardianName || 'Guardian',
                subtitle: ['Guardian', data.guardianPhone].filter(Boolean).join(' · '),
                avatar: <Avatar name={data.guardianName || 'Guardian'} size={36} />,
                accessory: data.guardianPhone ? call(data.guardianPhone, data.guardianName || 'the guardian') : undefined,
                lines: 2,
              },
            ]
          : []),
        ...(data.fatherName && data.fatherName !== data.guardianName ? [{ title: data.fatherName, subtitle: 'Father', avatar: <Avatar name={data.fatherName} size={36} /> }] : []),
        ...(data.motherName && data.motherName !== data.guardianName ? [{ title: data.motherName, subtitle: 'Mother', avatar: <Avatar name={data.motherName} size={36} /> }] : []),
        ...(data.phone ? [{ title: data.name, subtitle: `Student · ${data.phone}`, avatar: <Avatar name={data.name} size={36} />, accessory: call(data.phone, data.name), lines: 2 }] : []),
      ]
    : []

  return (
    <MobileScreen
      overlay={
        <ActionSheet
          open={picking}
          onClose={() => setPicking(false)}
          title="Which exam's report card?"
          actions={examList.map((exam) => ({ label: exam.name, icon: Award, onSelect: () => shareReport(exam._id, exam.name) }))}
        />
      }
      refreshing={record.isRefetching}
      onRefresh={record.refetch}
      nav={
        <NavBar
          title="Student"
          back={{ label: 'Back', onPress: router.back }}
          actions={canEdit && data ? [{ icon: Pencil, label: 'Edit student', onPress: () => router.push({ pathname: '/student/edit', params: { id: data._id } }) }] : []}
        />
      }
    >
      {record.isPending ? (
        <CardSkeleton rows={4} />
      ) : record.isError ? (
        <LoadFailed what="The student's record" error={record.error} onRetry={record.refetch} />
      ) : data ? (
        <>
          <View style={{ alignItems: 'center', gap: space['space-1'], paddingTop: space['space-2'] }}>
            <Avatar name={data.name} src={data.profileImage} size={80} />
            <Text variant="m-section" accessibilityRole="header" style={{ marginTop: space['space-2'], textAlign: 'center' }}>
              {data.name}
            </Text>
            <Text variant="m-subhead" tone="muted">
              {[classLabel(data.class, data.section), data.classRollNo ? `Roll ${data.classRollNo}` : null].filter(Boolean).join(' · ')}
            </Text>
          </View>
          {family.length ? <ListGroup header="Family" items={family} /> : null}
          <Surface>
            <DetailList
              columns={2}
              items={[
                { label: 'Admission no.', value: data.rollNumber },
                { label: 'Date of birth', value: data.dateOfBirth ? formatDate(data.dateOfBirth) : null },
                { label: 'Gender', value: data.gender },
                { label: 'Bus', value: data.busNo },
                { label: 'Admitted on', value: data.admissionDate ? formatDate(data.admissionDate) : null },
                { label: 'Email', value: data.guardianEmail, wide: true },
                { label: 'Address', value: data.fullAddress, wide: true },
                ...(data.notes ? [{ label: 'Notes', value: data.notes, wide: true }] : []),
              ]}
            />
          </Surface>
          {data.documents?.length ? (
            <ListGroup
              header="Documents"
              footer="Opens the file. New documents are added from a computer for now."
              items={data.documents.map((doc) => ({
                title: doc.name || doc.type || 'Document',
                subtitle: doc.uploadedAt ? `Added ${formatDate(doc.uploadedAt)}` : undefined,
                icon: FileText,
                tile: 6,
                onPress: () => Linking.openURL(doc.url),
              }))}
            />
          ) : null}
          {canCard || (canReport && examList.length) ? (
            <ListGroup
              items={[
                ...(canReport && examList.length
                  ? [
                      {
                        title: 'Report card',
                        subtitle: examList.length === 1 ? `${examList[0].name} · share or print` : 'Choose the exam · share or print',
                        icon: Award,
                        tile: 6 as const,
                        onPress: () => (examList.length === 1 ? shareReport(examList[0]._id, examList[0].name) : setPicking(true)),
                      },
                    ]
                  : []),
                ...(canCard
                  ? [
                      {
                        title: sharing ? 'Making the PDF…' : 'ID card',
                        subtitle: data.idCardIssuedAt ? `Issued ${formatDate(data.idCardIssuedAt)} · share or print` : 'Not issued yet · makes it now',
                        icon: IdCard,
                        tile: 6 as const,
                        onPress: shareCard,
                      },
                    ]
                  : []),
              ]}
            />
          ) : null}
        </>
      ) : null}
    </MobileScreen>
  )
}
