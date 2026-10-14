import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Check, Crown, Home, ListChecks, Plus, Search, SlidersHorizontal, Trash2, UserPlus, Users, X } from 'lucide-react'
import api from '@/services/api'
import {
  Avatar,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Icon,
  Menu,
  Page,
  Select,
  Sheet,
  StatCard,
  TextField,
  cx,
  type Tone,
} from '@/components/ui'
import { toneStyle } from '@/components/actvt/entityTone'
import '@/components/actvt/actvt.css'
import '@/components/actvt/council.css'

type HouseOption = { _id?: string; name?: string; color?: string }

type Council = {
  _id?: string
  name?: string
  councilType?: string
  houseId?: string
  houseName?: string
  posts?: CouncilPost[]
}

type CouncilPost = {
  _id?: string
  councilId?: string
  title?: string
  seats?: number
  registrationStatus?: string
  preferredGender?: string
  preferredClasses?: string[]
  pendingCount?: number
  acceptedCount?: number
}

type Registration = {
  _id?: string
  postId?: string
  studentId?: string
  studentName?: string
  rollNumber?: string
  className?: string
  section?: string
  gender?: string
  houseId?: string
  houseName?: string
  status?: string
}

type StudentHit = {
  _id?: string
  name?: string
  rollNumber?: string
  class?: string
  section?: string
  gender?: string
  house?: string
  houseId?: string
  phone?: string
}

type PostStatus = 'closed' | 'open' | 'accepting'

const GENDER_OPTIONS = ['Boy', 'Girl', 'Other'] as const
const COUNCIL_PATH = '/actvt/student-council'

const POST_STATUS: Record<string, { label: string; tone: Tone }> = {
  open: { label: 'Open', tone: 'success' },
  accepting: { label: 'Accepting', tone: 'info' },
  closed: { label: 'Closed', tone: 'neutral' },
}

const REGISTRATION_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Pending', tone: 'warning' },
  accepted: { label: 'Selected', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
}

const STATUS_OPTIONS = [
  { value: 'open', label: 'Open' },
  { value: 'accepting', label: 'Accepting' },
  { value: 'closed', label: 'Closed' },
]

const postStatusOf = (post: CouncilPost) => POST_STATUS[post.registrationStatus || 'closed'] || POST_STATUS.closed

const normalizeGender = (value?: string) => {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const lower = raw.toLowerCase()
  if (['boy', 'male', 'm'].includes(lower)) return 'Boy'
  if (['girl', 'female', 'f'].includes(lower)) return 'Girl'
  if (lower === 'other') return 'Other'
  return raw
}

const isStudentEligible = (post: CouncilPost | null, student: StudentHit) => {
  if (!post) return true
  const preferredGender = normalizeGender(post.preferredGender)
  const studentGender = normalizeGender(student.gender)
  if (preferredGender) {
    if (!studentGender || preferredGender !== studentGender) return false
  }
  const preferredClasses = (post.preferredClasses || [])
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
  if (preferredClasses.length) {
    const studentClass = String(student.class || '').trim().toLowerCase()
    if (!studentClass || !preferredClasses.includes(studentClass)) return false
  }
  return true
}

const formatEligibility = (post: CouncilPost) => {
  const parts: string[] = []
  if (post.preferredGender) parts.push(post.preferredGender)
  if (post.preferredClasses?.length) parts.push(`Class ${post.preferredClasses.join(', ')}`)
  return parts.length ? parts.join(' · ') : 'Any gender · Any class'
}

const toggleClassValue = (className: string, current: string[], setter: (next: string[]) => void) => {
  if (current.includes(className)) setter(current.filter((item) => item !== className))
  else setter([...current, className])
}

const studentMeta = (parts: { gender?: string; className?: string; section?: string; rollNumber?: string }) =>
  [
    parts.gender || 'Gender not set',
    parts.className ? `Class ${parts.className}${parts.section ? `-${parts.section}` : ''}` : '',
    parts.rollNumber ? `Adm ${parts.rollNumber}` : '',
  ]
    .filter(Boolean)
    .join(' · ')

const ClassChips: React.FC<{ options: string[]; value: string[]; onChange: (next: string[]) => void }> = ({
  options,
  value,
  onChange,
}) =>
  options.length === 0 ? (
    <p className="asc-hint">No classes found. Add students to pick classes here.</p>
  ) : (
    <div className="asc-chips" role="group" aria-label="Preferred classes">
      {options.map((className) => {
        const active = value.includes(className)
        return (
          <button
            key={className}
            type="button"
            className={cx('cb-chip', active && 'is-active')}
            aria-pressed={active}
            onClick={() => toggleClassValue(className, value, onChange)}
          >
            {className}
          </button>
        )
      })}
    </div>
  )

const ActvtStudentCouncil: React.FC = () => {
  const navigate = useNavigate()
  const [houses, setHouses] = useState<HouseOption[]>([])
  const [classOptions, setClassOptions] = useState<string[]>([])
  const [schoolCouncil, setSchoolCouncil] = useState<Council | null>(null)
  const [schoolPosts, setSchoolPosts] = useState<CouncilPost[]>([])
  const [houseCouncils, setHouseCouncils] = useState<Council[]>([])
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [schoolPostTitle, setSchoolPostTitle] = useState('')
  const [schoolPostSeats, setSchoolPostSeats] = useState('1')
  const [schoolPostGender, setSchoolPostGender] = useState('')
  const [schoolPostClasses, setSchoolPostClasses] = useState<string[]>([])
  const [showSchoolPostForm, setShowSchoolPostForm] = useState(false)

  const [housePostTitle, setHousePostTitle] = useState('')
  const [housePostSeats, setHousePostSeats] = useState('1')
  const [showHousePostForm, setShowHousePostForm] = useState(false)

  const [selectedPostId, setSelectedPostId] = useState('')
  const [editingPostId, setEditingPostId] = useState('')
  const [editGender, setEditGender] = useState('')
  const [editClasses, setEditClasses] = useState<string[]>([])
  const [studentQuery, setStudentQuery] = useState('')
  const [studentHits, setStudentHits] = useState<StudentHit[]>([])
  const [searchingStudents, setSearchingStudents] = useState(false)
  const [removeTarget, setRemoveTarget] = useState<{ post: CouncilPost; acrossAllHouses: boolean } | null>(null)
  const [removing, setRemoving] = useState(false)

  const allPosts = useMemo(
    () => [...schoolPosts, ...houseCouncils.flatMap((council) => council.posts || [])],
    [schoolPosts, houseCouncils]
  )
  const selectedPost = useMemo(
    () => allPosts.find((item) => String(item._id) === selectedPostId) || null,
    [allPosts, selectedPostId]
  )
  const selectedCouncil = useMemo(() => {
    if (!selectedPost?.councilId) return null
    if (schoolCouncil && String(schoolCouncil._id) === String(selectedPost.councilId)) return schoolCouncil
    return houseCouncils.find((item) => String(item._id) === String(selectedPost.councilId)) || null
  }, [selectedPost, schoolCouncil, houseCouncils])
  const postRegistrations = useMemo(
    () => registrations.filter((item) => String(item.postId) === selectedPostId),
    [registrations, selectedPostId]
  )
  const eligibleStudentHits = useMemo(
    () => studentHits.filter((student) => isStudentEligible(selectedPost, student)),
    [studentHits, selectedPost]
  )
  const editingPost = useMemo(
    () => schoolPosts.find((item) => String(item._id) === editingPostId) || null,
    [schoolPosts, editingPostId]
  )

  /** House colour lookup by id first, then by name (registrations and search hits carry either). */
  const houseTone = useMemo(() => {
    const byId = new Map<string, { color?: string; index: number }>()
    const byName = new Map<string, { color?: string; index: number }>()
    houses.forEach((house, index) => {
      const entry = { color: house.color, index }
      if (house._id) byId.set(String(house._id), entry)
      if (house.name) byName.set(house.name.trim().toLowerCase(), entry)
    })
    return (id?: string, name?: string) =>
      (id && byId.get(String(id))) || (name && byName.get(name.trim().toLowerCase())) || null
  }, [houses])

  const totals = useMemo(() => {
    let open = 0
    let pending = 0
    let selected = 0
    let seats = 0
    allPosts.forEach((post) => {
      if (post.registrationStatus === 'open' || post.registrationStatus === 'accepting') open += 1
      pending += post.pendingCount || 0
      selected += post.acceptedCount || 0
      seats += post.seats || 1
    })
    return { posts: allPosts.length, open, pending, selected, seats }
  }, [allPosts])

  const loadClassOptions = async () => {
    try {
      const response = await api.get('/students/stats')
      const byClass = (response.data?.data?.byClass || []) as Array<{ _id?: string }>
      setClassOptions(
        byClass
          .map((row) => String(row._id || '').trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      )
    } catch {
      setClassOptions([])
    }
  }

  const loadBoard = async () => {
    setLoading(true)
    try {
      const response = await api.get('/actvt/councils/board')
      const data = response.data?.data || {}
      const nextSchoolPosts = (data.schoolPosts || []) as CouncilPost[]
      const nextHouseCouncils = (data.houseCouncils || []) as Council[]
      setHouses((data.houses || []) as HouseOption[])
      setSchoolCouncil((data.schoolCouncil || null) as Council | null)
      setSchoolPosts(nextSchoolPosts)
      setHouseCouncils(nextHouseCouncils)
      setRegistrations((data.registrations || []) as Registration[])
      const postIds = new Set([
        ...nextSchoolPosts.map((item) => String(item._id || '')),
        ...nextHouseCouncils.flatMap((council) => (council.posts || []).map((item) => String(item._id || ''))),
      ])
      setSelectedPostId((prev) => (postIds.has(prev) ? prev : ''))
    } catch (error: any) {
      toast.error(String(error?.response?.data?.message || error?.message || 'Failed to load student council.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadBoard()
    void loadClassOptions()
  }, [])

  useEffect(() => {
    const needle = studentQuery.trim()
    if (needle.length < 2) {
      setStudentHits([])
      return undefined
    }
    const timer = window.setTimeout(async () => {
      setSearchingStudents(true)
      try {
        const params: Record<string, string | number | boolean> = { search: needle, lite: true, limit: 20 }
        if (selectedPost?.preferredClasses?.length === 1) {
          params.class = selectedPost.preferredClasses[0]
        }
        const response = await api.get('/students', { params })
        setStudentHits((response.data?.data || []) as StudentHit[])
      } catch {
        setStudentHits([])
      } finally {
        setSearchingStudents(false)
      }
    }, 300)
    return () => window.clearTimeout(timer)
  }, [studentQuery, selectedPost?.preferredClasses])

  const onAddSchoolPost = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!schoolCouncil?._id) {
      toast.error('School council is not ready yet.')
      return
    }
    if (!schoolPostTitle.trim()) {
      toast.error('Post title is required.')
      return
    }
    setSaving(true)
    try {
      await api.post('/actvt/council-posts', {
        councilId: schoolCouncil._id,
        title: schoolPostTitle.trim(),
        seats: Number(schoolPostSeats) || 1,
        preferredGender: schoolPostGender,
        preferredClasses: schoolPostClasses,
      })
      setSchoolPostTitle('')
      setSchoolPostSeats('1')
      setSchoolPostGender('')
      setSchoolPostClasses([])
      setShowSchoolPostForm(false)
      await loadBoard()
    } catch (error: any) {
      // API interceptor already shows the error toast.
    } finally {
      setSaving(false)
    }
  }

  const onStartEditSchoolPost = (post: CouncilPost) => {
    setEditingPostId(String(post._id || ''))
    setEditGender(post.preferredGender || '')
    setEditClasses([...(post.preferredClasses || [])])
  }

  const onSaveSchoolPostEligibility = async (post: CouncilPost) => {
    if (!post._id) return
    setSaving(true)
    try {
      await api.put(`/actvt/council-posts/${post._id}`, {
        preferredGender: editGender,
        preferredClasses: editClasses,
      })
      setEditingPostId('')
      await loadBoard()
    } catch (error: any) {
      // API interceptor already shows the error toast.
    } finally {
      setSaving(false)
    }
  }

  const onAddHousePost = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!houses.length) {
      toast.error('Add a house first to add posts to the house council.')
      return
    }
    if (!housePostTitle.trim()) {
      toast.error('Post title is required.')
      return
    }
    setSaving(true)
    try {
      await api.post('/actvt/council-posts', {
        title: housePostTitle.trim(),
        seats: Number(housePostSeats) || 1,
        applyToAllHouseCouncils: true,
      })
      setHousePostTitle('')
      setHousePostSeats('1')
      setShowHousePostForm(false)
      await loadBoard()
    } catch (error: any) {
      // API interceptor already shows the error toast.
    } finally {
      setSaving(false)
    }
  }

  const onSetPostStatus = async (post: CouncilPost, registrationStatus: PostStatus) => {
    if (!post._id) return
    try {
      await api.put(`/actvt/council-posts/${post._id}`, { registrationStatus })
      await loadBoard()
    } catch (error: any) {
      // API interceptor already shows the error toast.
    }
  }

  const onConfirmRemovePost = async () => {
    if (!removeTarget?.post._id) return
    const { post, acrossAllHouses } = removeTarget
    setRemoving(true)
    try {
      await api.delete(`/actvt/council-posts/${post._id}`, {
        params: acrossAllHouses ? { applyToAllHouseCouncils: true } : undefined,
      })
      setRemoveTarget(null)
      await loadBoard()
    } catch (error: any) {
      // API interceptor already shows the error toast.
    } finally {
      setRemoving(false)
    }
  }

  const onRegisterStudent = async (student: StudentHit) => {
    if (!selectedPostId || !selectedPost) {
      toast.error('Select a post first.')
      return
    }
    if (selectedPost.registrationStatus === 'closed') {
      toast.error('Registrations are closed for this post.')
      return
    }
    if (!isStudentEligible(selectedPost, student)) {
      toast.error(`Only ${formatEligibility(selectedPost)} students can register for this post.`)
      return
    }
    try {
      await api.post('/actvt/council-registrations', {
        postId: selectedPostId,
        studentId: student._id,
        studentName: student.name,
        rollNumber: student.rollNumber,
        className: student.class,
        section: student.section,
        gender: student.gender,
        houseId: student.houseId || selectedCouncil?.houseId || '',
        houseName: student.house || selectedCouncil?.houseName || '',
        phone: student.phone || '',
      })
      setStudentQuery('')
      setStudentHits([])
      await loadBoard()
    } catch (error: any) {
      // API interceptor already shows the error toast.
    }
  }

  const onUpdateRegistration = async (registration: Registration, status: 'accepted' | 'rejected') => {
    if (!registration._id) return
    try {
      await api.put(`/actvt/council-registrations/${registration._id}`, { status })
      await loadBoard()
    } catch (error: any) {
      // API interceptor already shows the error toast.
    }
  }

  const openHousePostForm = () => {
    if (!houses.length) {
      toast.error('Add a house first to add posts to the house council.')
      return
    }
    setShowHousePostForm(true)
  }

  const closeRegistrations = () => {
    setSelectedPostId('')
    setStudentQuery('')
    setStudentHits([])
  }

  const openStudentProfile = (studentId?: string) => {
    if (!studentId) return
    navigate(`/actvt/students/${studentId}`, { state: { from: COUNCIL_PATH } })
  }

  const renderHouseDot = (houseId?: string, houseName?: string) => {
    const match = houseTone(houseId, houseName)
    if (!match) return null
    return <span className="actvt-tone-dot" style={toneStyle(match.color, match.index)} aria-hidden="true" />
  }

  const selectedStatus = selectedPost ? postStatusOf(selectedPost) : POST_STATUS.closed
  const selectedClosed = selectedPost?.registrationStatus === 'closed' || !selectedPost?.registrationStatus
  const selectedHouseMatch =
    selectedCouncil?.councilType === 'house' ? houseTone(selectedCouncil.houseId, selectedCouncil.houseName) : null
  const booting = loading && !schoolCouncil && allPosts.length === 0

  return (
    <Page>
      <div className="asc">
        <div className="cb-stats">
          <StatCard label="Council posts" value={totals.posts} icon={Crown} hint={`${totals.seats} seats in all`} />
          <StatCard label="Taking registrations" value={totals.open} icon={ListChecks} hint="Open or accepting" />
          <StatCard label="Pending registrations" value={totals.pending} icon={Users} hint="Waiting for a decision" />
          <StatCard label="Members selected" value={totals.selected} icon={Check} hint="Across all councils" />
        </div>

        <Card
          title="School council"
          subtitle="Each post can prefer a gender and classes. Only matching students can register."
          action={
            <Button variant="primary" icon={Plus} onClick={() => setShowSchoolPostForm(true)}>
              Add post
            </Button>
          }
        >
          {booting ? (
            <div className="cb-table-state" role="status">
              <span className="cb-spinner" aria-hidden="true" />
              Loading school council…
            </div>
          ) : schoolPosts.length === 0 ? (
            <EmptyState
              compact
              icon={Crown}
              title="No school council posts yet"
              body="Add roles like Head boy or Head girl, then open them for registration."
              action={
                <Button icon={Plus} onClick={() => setShowSchoolPostForm(true)}>
                  Add post
                </Button>
              }
            />
          ) : (
            <ul className="asc-posts">
              {schoolPosts.map((post) => (
                <PostRow
                  key={post._id}
                  post={post}
                  showEligibility
                  active={String(post._id) === selectedPostId}
                  onSelect={() => setSelectedPostId(String(post._id || ''))}
                  onSetStatus={onSetPostStatus}
                  onRemove={() => setRemoveTarget({ post, acrossAllHouses: false })}
                  onEditEligibility={() => onStartEditSchoolPost(post)}
                />
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="House councils"
          subtitle="Created for each house. A post added here is added to every house."
          action={
            houses.length ? (
              <Button icon={Plus} onClick={openHousePostForm}>
                Add house post
              </Button>
            ) : null
          }
        >
          {booting ? (
            <div className="cb-table-state" role="status">
              <span className="cb-spinner" aria-hidden="true" />
              Loading house councils…
            </div>
          ) : !houses.length ? (
            <EmptyState
              compact
              icon={Home}
              title="No houses yet"
              body="House councils are created for each house. Add a house first, then add posts here."
              action={
                <Button icon={Home} onClick={() => navigate('/actvt/houses')}>
                  Go to houses
                </Button>
              }
            />
          ) : (
            <ul className="asc-houses">
              {houseCouncils.map((council, index) => {
                const houseIndex = houses.findIndex((house) => String(house._id) === String(council.houseId))
                const house = houseIndex >= 0 ? houses[houseIndex] : null
                const posts = council.posts || []
                return (
                  <li
                    key={council._id}
                    className="asc-house actvt-tone-border"
                    style={toneStyle(house?.color, houseIndex >= 0 ? houseIndex : index)}
                  >
                    <div className="asc-house__head actvt-tone-soft">
                      <span className="asc-house__swatch actvt-tone-fill" aria-hidden="true">
                        <Icon icon={Home} size={14} />
                      </span>
                      <span className="asc-house__name">{council.houseName || council.name || 'House'} council</span>
                      <span className="asc-house__count">
                        {posts.length} {posts.length === 1 ? 'post' : 'posts'}
                      </span>
                    </div>
                    {posts.length === 0 ? (
                      <p className="asc-house__empty">No posts yet. Use Add house post to add one to every house.</p>
                    ) : (
                      <ul className="asc-posts asc-posts--compact">
                        {posts.map((post) => (
                          <PostRow
                            key={post._id}
                            post={post}
                            compact
                            active={String(post._id) === selectedPostId}
                            onSelect={() => setSelectedPostId(String(post._id || ''))}
                            onSetStatus={onSetPostStatus}
                            onRemove={() => setRemoveTarget({ post, acrossAllHouses: true })}
                          />
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {!booting && allPosts.length > 0 ? (
          <p className="asc-hint asc-hint--center">
            <Icon icon={Users} size={14} />
            Open a post to register students and choose council members.
          </p>
        ) : null}
      </div>

      {/* Add school post */}
      <Sheet
        open={showSchoolPostForm}
        onClose={() => setShowSchoolPostForm(false)}
        title="Add school council post"
        description="Students who match the preferred gender and classes can register."
        icon={Crown}
        onSubmit={onAddSchoolPost}
        footer={
          <>
            <Button variant="tertiary" onClick={() => setShowSchoolPostForm(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" loading={saving}>
              Add post
            </Button>
          </>
        }
      >
        <TextField
          label="Post title"
          required
          value={schoolPostTitle}
          onChange={(event) => setSchoolPostTitle(event.target.value)}
          placeholder="For example, Head boy"
          autoFocus
        />
        <div className="cb-form-grid">
          <TextField
            label="Seats"
            type="number"
            min={1}
            value={schoolPostSeats}
            onChange={(event) => setSchoolPostSeats(event.target.value)}
          />
          <Select
            label="Preferred gender"
            value={schoolPostGender}
            onChange={(event) => setSchoolPostGender(event.target.value)}
            placeholder="Any gender"
            options={[...GENDER_OPTIONS]}
          />
        </div>
        <div className="asc-field">
          <span className="asc-field__label">Preferred classes</span>
          <ClassChips options={classOptions} value={schoolPostClasses} onChange={setSchoolPostClasses} />
          <span className="asc-hint">Leave all unselected to allow any class.</span>
        </div>
      </Sheet>

      {/* Add house post (applies to every house council) */}
      <Dialog
        open={showHousePostForm}
        onClose={() => setShowHousePostForm(false)}
        title="Add house council post"
        description="The post is added to every house council."
        size="sm"
        footer={
          <>
            <Button variant="tertiary" onClick={() => setShowHousePostForm(false)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" form="asc-house-post-form" loading={saving}>
              Add to all houses
            </Button>
          </>
        }
      >
        <form id="asc-house-post-form" className="asc-form" onSubmit={onAddHousePost}>
          <TextField
            label="Post title"
            required
            value={housePostTitle}
            onChange={(event) => setHousePostTitle(event.target.value)}
            placeholder="For example, House captain"
            autoFocus
          />
          <TextField
            label="Seats per house"
            type="number"
            min={1}
            value={housePostSeats}
            onChange={(event) => setHousePostSeats(event.target.value)}
          />
        </form>
      </Dialog>

      {/* Edit eligibility (school posts) */}
      <Dialog
        open={Boolean(editingPost)}
        onClose={() => setEditingPostId('')}
        title={`Edit eligibility${editingPost?.title ? ` · ${editingPost.title}` : ''}`}
        description="Only students who match can register for this post."
        footer={
          <>
            <Button variant="tertiary" onClick={() => setEditingPostId('')}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={saving}
              onClick={() => editingPost && void onSaveSchoolPostEligibility(editingPost)}
            >
              Save eligibility
            </Button>
          </>
        }
      >
        <div className="asc-form">
          <Select
            label="Preferred gender"
            value={editGender}
            onChange={(event) => setEditGender(event.target.value)}
            placeholder="Any gender"
            options={[...GENDER_OPTIONS]}
          />
          <div className="asc-field">
            <span className="asc-field__label">Preferred classes</span>
            <ClassChips options={classOptions} value={editClasses} onChange={setEditClasses} />
            <span className="asc-hint">Leave all unselected to allow any class.</span>
          </div>
        </div>
      </Dialog>

      {/* Remove post */}
      <Dialog
        open={Boolean(removeTarget)}
        onClose={() => (removing ? undefined : setRemoveTarget(null))}
        tone="danger"
        size="sm"
        title={removeTarget?.acrossAllHouses ? 'Remove post from all houses?' : 'Remove this post?'}
        description={
          removeTarget?.acrossAllHouses
            ? `“${removeTarget?.post.title || 'This post'}” will be removed from every house council, with its registrations.`
            : `“${removeTarget?.post.title || 'This post'}” will be removed from the school council, with its registrations.`
        }
        footer={
          <>
            <Button variant="tertiary" onClick={() => setRemoveTarget(null)} disabled={removing}>
              Cancel
            </Button>
            <Button variant="danger" icon={Trash2} loading={removing} onClick={() => void onConfirmRemovePost()}>
              Remove post
            </Button>
          </>
        }
      />

      {/* Registrations for the selected post */}
      <Sheet
        open={Boolean(selectedPost)}
        onClose={closeRegistrations}
        size="lg"
        icon={UserPlus}
        title={selectedPost?.title || 'Registrations'}
        description={
          selectedPost
            ? `${
                selectedCouncil?.councilType === 'house'
                  ? `${selectedCouncil.houseName || 'House'} council`
                  : 'School council'
              } · Preferred: ${formatEligibility(selectedPost)}`
            : undefined
        }
        footer={
          <Button variant="secondary" onClick={closeRegistrations}>
            Done
          </Button>
        }
      >
        {selectedPost ? (
          <>
            <div
              className={cx('asc-postsum', selectedHouseMatch && 'actvt-tone-bar')}
              style={selectedHouseMatch ? toneStyle(selectedHouseMatch.color, selectedHouseMatch.index) : undefined}
            >
              <div className="asc-postsum__row">
                {selectedHouseMatch ? (
                  <span className="actvt-tone-dot" aria-hidden="true" />
                ) : null}
                <Badge tone={selectedStatus.tone}>{selectedStatus.label}</Badge>
                <span className="asc-postsum__meta">
                  {selectedPost.seats || 1} {(selectedPost.seats || 1) === 1 ? 'seat' : 'seats'} ·{' '}
                  {selectedPost.pendingCount || 0} pending · {selectedPost.acceptedCount || 0} selected
                </span>
              </div>
              <Select
                aria-label="Registration status"
                size="sm"
                className="asc-postsum__status"
                value={selectedPost.registrationStatus || 'closed'}
                onChange={(event) => void onSetPostStatus(selectedPost, event.target.value as PostStatus)}
                options={STATUS_OPTIONS}
              />
            </div>

            <div className="asc-finder">
              <TextField
                label="Register a student"
                icon={Search}
                type="search"
                value={studentQuery}
                onChange={(event) => setStudentQuery(event.target.value)}
                placeholder="Search students by name"
                disabled={selectedClosed}
                hint={
                  selectedClosed
                    ? 'Registrations are closed. Change the status to Open to register students.'
                    : 'Type at least 2 letters. Only eligible students are listed.'
                }
              />
              {searchingStudents ? (
                <div className="cb-table-state asc-finder__state" role="status">
                  <span className="cb-spinner" aria-hidden="true" />
                  Searching students…
                </div>
              ) : null}
              {!searchingStudents && studentHits.length > 0 ? (
                eligibleStudentHits.length === 0 ? (
                  <p className="asc-finder__none">
                    No matching students for this post’s preferred gender or class. Try another name.
                  </p>
                ) : (
                  <ul className="asc-hits" aria-label="Matching students">
                    {eligibleStudentHits.map((student) => (
                      <li key={student._id} className="asc-hit">
                        <Avatar name={student.name || 'Student'} size="md" />
                        <div className="asc-person">
                          <span className="asc-person__name">{student.name}</span>
                          <span className="asc-person__meta">
                            {renderHouseDot(student.houseId, student.house)}
                            {studentMeta({
                              gender: student.gender,
                              className: student.class,
                              section: student.section,
                              rollNumber: student.rollNumber,
                            })}
                            {student.house ? ` · ${student.house}` : ''}
                          </span>
                        </div>
                        <Button size="sm" icon={UserPlus} onClick={() => void onRegisterStudent(student)}>
                          Register
                        </Button>
                      </li>
                    ))}
                  </ul>
                )
              ) : null}
            </div>

            <div className="asc-regs">
              <h3 className="asc-regs__title">
                Registrations <span className="asc-regs__count">{postRegistrations.length}</span>
              </h3>
              {postRegistrations.length === 0 ? (
                <EmptyState
                  compact
                  icon={Users}
                  title="No registrations yet"
                  body={
                    selectedClosed
                      ? 'Open the post for registration, then search for students above.'
                      : 'Search for a student above to register them for this post.'
                  }
                />
              ) : (
                <ul className="asc-reglist">
                  {postRegistrations.map((item) => {
                    const status = REGISTRATION_STATUS[item.status || 'pending'] || REGISTRATION_STATUS.pending
                    return (
                      <li key={item._id} className="asc-reg">
                        <Avatar name={item.studentName || 'Student'} size="md" />
                        <div className="asc-person">
                          <span className="asc-person__line">
                            {item.studentId ? (
                              <button
                                type="button"
                                className="asc-person__name asc-person__link"
                                onClick={() => openStudentProfile(item.studentId)}
                              >
                                {item.studentName}
                              </button>
                            ) : (
                              <span className="asc-person__name">{item.studentName}</span>
                            )}
                            <Badge tone={status.tone}>{status.label}</Badge>
                          </span>
                          <span className="asc-person__meta">
                            {renderHouseDot(item.houseId, item.houseName)}
                            {studentMeta({
                              gender: item.gender,
                              className: item.className,
                              section: item.section,
                              rollNumber: item.rollNumber,
                            })}
                            {item.houseName ? ` · ${item.houseName}` : ''}
                          </span>
                        </div>
                        <div className="asc-reg__actions">
                          <Button
                            size="sm"
                            icon={Check}
                            onClick={() => void onUpdateRegistration(item, 'accepted')}
                            disabled={item.status === 'accepted'}
                          >
                            Select
                          </Button>
                          <Button
                            size="sm"
                            variant="tertiary"
                            icon={X}
                            onClick={() => void onUpdateRegistration(item, 'rejected')}
                            disabled={item.status === 'rejected'}
                          >
                            Reject
                          </Button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </>
        ) : null}
      </Sheet>
    </Page>
  )
}

const PostRow = ({
  post,
  active,
  compact = false,
  showEligibility = false,
  onSelect,
  onSetStatus,
  onRemove,
  onEditEligibility,
}: {
  post: CouncilPost
  active: boolean
  compact?: boolean
  showEligibility?: boolean
  onSelect: () => void
  onSetStatus: (post: CouncilPost, status: PostStatus) => void
  onRemove: () => void
  onEditEligibility?: () => void
}) => {
  const status = postStatusOf(post)
  const seats = post.seats || 1
  const accepted = post.acceptedCount || 0
  const current = (post.registrationStatus || 'closed') as PostStatus
  return (
    <li className={cx('asc-post', compact && 'asc-post--compact', active && 'is-active')}>
      <button type="button" className="asc-post__open" onClick={onSelect}>
        <span className="asc-post__line">
          <span className="asc-post__title">{post.title}</span>
          <Badge tone={status.tone}>{status.label}</Badge>
        </span>
        <span className="asc-post__meta">
          {accepted}/{seats} {seats === 1 ? 'seat' : 'seats'} filled · {post.pendingCount || 0} pending
          {showEligibility ? ` · ${formatEligibility(post)}` : ''}
        </span>
      </button>
      <div className="asc-post__actions">
        <Button size="sm" variant="tertiary" icon={UserPlus} onClick={onSelect} className="asc-post__manage">
          Registrations
        </Button>
        <Menu
          label={`Actions for ${post.title || 'post'}`}
          items={[
            {
              label: 'Open registrations',
              icon: ListChecks,
              disabled: current === 'open',
              onSelect: () => onSetStatus(post, 'open'),
            },
            {
              label: 'Mark as accepting',
              icon: Check,
              disabled: current === 'accepting',
              onSelect: () => onSetStatus(post, 'accepting'),
            },
            {
              label: 'Close registrations',
              icon: X,
              disabled: current === 'closed',
              onSelect: () => onSetStatus(post, 'closed'),
            },
            ...(onEditEligibility
              ? [{ divider: true as const }, { label: 'Edit eligibility', icon: SlidersHorizontal, onSelect: onEditEligibility }]
              : []),
            { divider: true as const },
            { label: 'Remove post', icon: Trash2, tone: 'danger' as const, onSelect: onRemove },
          ]}
        />
      </div>
    </li>
  )
}

export default ActvtStudentCouncil
