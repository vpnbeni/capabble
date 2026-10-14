import React, { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { BookOpen, Download, ExternalLink, FileText, Paperclip, Search, SearchX, Upload } from 'lucide-react'
import {
  Button,
  Card,
  CardToolbar,
  DataTable,
  Dialog,
  EmptyState,
  Entity,
  FilterBar,
  Icon,
  Page,
  Sheet,
  StatCard,
  Tabs,
  type DataTableColumn,
} from '@/components/ui'
import { CardLoading, errorMessage } from '@/components/exmcl/ExmclUi'
import '@/components/exmcl/centre-guidelines.css'
import {
  useCentreGuidelinesCheck,
  useCentreGuidelinesParsed,
  useGuidelinesViewerMutation,
  useSearchCentreGuidelinesMutation,
  useUploadCentreGuidelinesMutation,
} from '../hooks/useCentreGuidelines'

interface Chapter {
  number: string
  title: string
  description?: string
  fullContent?: string
  formattedContent?: ContentBlock[]
  startPage?: number
}

interface ContentBlock {
  type: 'heading' | 'numbered' | 'bullet' | 'paragraph' | 'table'
  text?: string
  rows?: string[][]
}

interface Appendix {
  letter: string
  title: string
  subtitle?: string
  fullContent?: string
  formattedContent?: ContentBlock[]
  startPage?: number
}

interface Guideline {
  number: string
  text: string
}

interface SearchResult {
  text: string
  index: number
}

interface GuidelinesData {
  metadata: {
    pages: number
    totalCharacters: number
  }
  structure: {
    chapters: Chapter[]
    appendices: Appendix[]
    guidelines: Guideline[]
    headings: string[]
  }
  fullText: string
}

type GuidelinesTab = 'viewer' | 'chapters' | 'appendices' | 'search'

/** Formatted blocks from the parser, or the raw text when there are none. */
const SectionText: React.FC<{ blocks?: ContentBlock[]; fallback?: string }> = ({ blocks, fallback }) => {
  if (!blocks || blocks.length === 0) {
    return (
      <div className="cx-cg-doc">
        <p className="cx-cg-doc__plain">{fallback || '—'}</p>
      </div>
    )
  }
  return (
    <div className="cx-cg-doc">
      {blocks.map((block, blockIndex) => {
        switch (block.type) {
          case 'heading':
            return (
              <h4 key={blockIndex} className="cb-subhead">
                {block.text}
              </h4>
            )
          case 'numbered':
            return (
              <div key={blockIndex} className="cx-cg-num">
                <span className="cb-strong is-num">{block.text?.match(/^\d+\./)?.[0]}</span>
                <span>{block.text?.replace(/^\d+\.\s*/, '')}</span>
              </div>
            )
          case 'bullet':
            return (
              <ul key={blockIndex} className="cx-cg-bullet">
                <li>{block.text?.replace(/^[•\-\*]\s*/, '').replace(/^[a-z]\)\s*/, '')}</li>
              </ul>
            )
          case 'table':
            return (
              <div key={blockIndex} className="cb-table-wrap cx-cg-table">
                <div className="cb-table-scroll">
                  <table className="cb-table">
                    {block.rows && block.rows.length > 0 ? (
                      <thead>
                        <tr>
                          {block.rows[0].map((cell, cellIndex) => (
                            <th key={cellIndex}>{cell}</th>
                          ))}
                        </tr>
                      </thead>
                    ) : null}
                    <tbody>
                      {block.rows?.slice(1).map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {row.map((cell, cellIndex) => (
                            <td key={cellIndex} className="is-wrap">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          case 'paragraph':
          default:
            return <p key={blockIndex}>{block.text}</p>
        }
      })}
    </div>
  )
}

const CentreGuidelines: React.FC = () => {
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchedFor, setSearchedFor] = useState('')
  const [activeTab, setActiveTab] = useState<GuidelinesTab>('chapters')
  const [expandedAppendix, setExpandedAppendix] = useState<string | null>(null)
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null)
  const [pdfViewerUrl, setPdfViewerUrl] = useState<string | null>(null)
  const [pdfViewerLoading, setPdfViewerLoading] = useState(false)
  const pdfBlobUrlRef = useRef<string | null>(null)
  const previousUploadedPdfRef = useRef<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const checkQuery = useCentreGuidelinesCheck()
  const uploadedPdf = checkQuery.data?.exists && checkQuery.data?.path ? checkQuery.data.path : null
  const parsedQuery = useCentreGuidelinesParsed({ enabled: Boolean(uploadedPdf) })
  const uploadMutation = useUploadCentreGuidelinesMutation()
  const searchMutation = useSearchCentreGuidelinesMutation()
  const viewerMutation = useGuidelinesViewerMutation()
  const guidelinesData = (parsedQuery.data as GuidelinesData | null) ?? null
  const loading = checkQuery.isLoading || (Boolean(uploadedPdf) && parsedQuery.isLoading)
  const uploading = uploadMutation.isPending
  const searching = searchMutation.isPending

  // Invalidate PDF viewer cache when the guidelines document changes (new upload)
  useEffect(() => {
    if (previousUploadedPdfRef.current !== null && previousUploadedPdfRef.current !== uploadedPdf) {
      if (pdfBlobUrlRef.current) {
        URL.revokeObjectURL(pdfBlobUrlRef.current)
        pdfBlobUrlRef.current = null
        setPdfViewerUrl(null)
      }
    }
    previousUploadedPdfRef.current = uploadedPdf
  }, [uploadedPdf])

  // Fetch PDF as blob only when on PDF Viewer tab and no cached URL (cache persists when switching tabs)
  useEffect(() => {
    if (activeTab !== 'viewer' || !uploadedPdf) return
    if (pdfViewerUrl) return // use cached blob URL, no refetch

    let cancelled = false
    setPdfViewerLoading(true)
    viewerMutation.mutateAsync()
      .then((blob) => {
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        pdfBlobUrlRef.current = url
        setPdfViewerUrl(url)
      })
      .catch(() => {
        if (!cancelled) setPdfViewerUrl(null)
      })
      .finally(() => {
        if (!cancelled) setPdfViewerLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [activeTab, uploadedPdf, pdfViewerUrl, viewerMutation])

  // Unmount: revoke blob URL to avoid memory leaks
  useEffect(() => {
    return () => {
      if (pdfBlobUrlRef.current) {
        URL.revokeObjectURL(pdfBlobUrlRef.current)
        pdfBlobUrlRef.current = null
      }
    }
  }, [])

  const setFileIfPdf = (file: File | null) => {
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file)
    } else if (file) {
      toast.error('Choose a PDF file.')
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFileIfPdf(e.target.files?.[0] ?? null)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    setFileIfPdf(file ?? null)
  }

  const handleUpload = async () => {
    if (!selectedFile) return

    try {
      await uploadMutation.mutateAsync(selectedFile)
      setShowUploadModal(false)
      setSelectedFile(null)
      toast.success('Guidelines uploaded.')
    } catch (error) {
      console.error('Upload error:', error)
      toast.error(errorMessage(error, 'The guidelines weren’t uploaded. Try again.'))
    }
  }

  const handleSearch = async () => {
    if (searchQuery.length < 3) {
      toast.error('Type at least 3 characters to search.')
      return
    }

    try {
      const results = await searchMutation.mutateAsync(searchQuery)
      setSearchResults(results)
      setSearchedFor(searchQuery)
      setActiveTab('search')
    } catch (error) {
      console.error('Search error:', error)
      toast.error(errorMessage(error, 'The search didn’t run. Try again.'))
    }
  }

  const closeUpload = () => {
    setShowUploadModal(false)
    setSelectedFile(null)
  }

  const openPdfPage = (page?: number) => {
    if (!uploadedPdf || !page) return
    window.open(`${uploadedPdf}#page=${page}`, '_blank', 'noopener,noreferrer')
  }

  const pageLink = (page?: number) =>
    page && uploadedPdf ? (
      <a className="cb-link is-num" href={`${uploadedPdf}#page=${page}`} target="_blank" rel="noopener noreferrer">
        Page {page}
      </a>
    ) : (
      '—'
    )

  const chapters = guidelinesData?.structure.chapters ?? []
  const appendices = guidelinesData?.structure.appendices ?? []
  const openChapter = expandedChapter ? chapters.find((chapter) => chapter.number === expandedChapter) ?? null : null
  const openAppendix = expandedAppendix ? appendices.find((appendix) => appendix.letter === expandedAppendix) ?? null : null
  const closeSection = () => {
    setExpandedChapter(null)
    setExpandedAppendix(null)
  }
  const openSectionPage = openChapter?.startPage ?? openAppendix?.startPage

  const chapterColumns: DataTableColumn<Chapter>[] = [
    { key: 'number', header: 'No.', numeric: true, width: 64, mobile: 'aside', render: (chapter) => chapter.number },
    {
      key: 'title',
      header: 'Chapter',
      mobile: 'title',
      wrap: true,
      render: (chapter) => <Entity primary={chapter.title || `Chapter ${chapter.number}`} secondary={chapter.description} />,
    },
    { key: 'page', header: 'Starts on', interactive: true, mobile: 'subtitle', render: (chapter) => pageLink(chapter.startPage) },
  ]

  const appendixColumns: DataTableColumn<Appendix>[] = [
    { key: 'letter', header: 'Appendix', width: 88, mobile: 'aside', render: (appendix) => appendix.letter },
    {
      key: 'title',
      header: 'Title',
      mobile: 'title',
      wrap: true,
      render: (appendix) => <Entity primary={appendix.title || `Appendix ${appendix.letter}`} secondary={appendix.subtitle} />,
    },
    { key: 'page', header: 'Starts on', interactive: true, mobile: 'subtitle', render: (appendix) => pageLink(appendix.startPage) },
  ]

  const searchColumns: DataTableColumn<SearchResult>[] = [
    {
      key: 'text',
      header: 'Excerpt',
      mobile: 'title',
      wrap: true,
      render: (result) => <p className="cx-cg-hit">…{result.text}…</p>,
    },
  ]

  const tabItems: Array<{ id: GuidelinesTab; label: string; count?: number }> = [
    { id: 'chapters', label: 'Chapters', count: guidelinesData ? chapters.length : undefined },
    { id: 'appendices', label: 'Appendices', count: guidelinesData ? appendices.length : undefined },
    { id: 'viewer', label: 'PDF' },
    ...(searchResults.length > 0 ? [{ id: 'search' as const, label: 'Search results', count: searchResults.length }] : []),
  ]

  const statValue = (value: number | undefined, suffix = '') =>
    loading || !guidelinesData || value == null ? '—' : `${value.toLocaleString('en-IN')}${suffix}`

  const downloadLink = uploadedPdf ? (
    <a className="cb-btn cb-btn--secondary cb-btn--sm" href={uploadedPdf} download>
      <Icon icon={Download} size={16} />
      <span className="cb-btn__label">Download PDF</span>
    </a>
  ) : null

  const cardTitle =
    activeTab === 'chapters'
      ? 'Chapters'
      : activeTab === 'appendices'
        ? 'Appendices'
        : activeTab === 'viewer'
          ? 'Guidelines document'
          : `Results for “${searchedFor}”`

  const hasDocument = Boolean(uploadedPdf || loading)

  return (
    <Page>

      {hasDocument ? (
        <>
          <section className="cb-stats" aria-label="Guidelines contents">
            <StatCard label="Pages" value={statValue(guidelinesData?.metadata.pages)} />
            <StatCard label="Chapters" value={statValue(guidelinesData?.structure.chapters.length)} />
            <StatCard label="Appendices" value={statValue(guidelinesData?.structure.appendices.length)} />
            <StatCard label="Numbered guidelines" value={statValue(guidelinesData?.structure.guidelines.length, '+')} />
          </section>

          <Tabs
            items={tabItems}
            value={activeTab}
            onChange={(id) => setActiveTab(id as GuidelinesTab)}
            label="Centre guidelines sections"
          />

          <Card
            flush
            title={cardTitle}
            action={
              <>
                {downloadLink}
                <Button size="sm" variant="primary" icon={Upload} onClick={() => setShowUploadModal(true)}>
                  {uploadedPdf ? 'Replace guidelines' : 'Upload guidelines'}
                </Button>
              </>
            }
          >
            <CardToolbar>
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  void handleSearch()
                }}
              >
                <FilterBar
                  search={{
                    placeholder: 'Search the full text',
                    value: searchQuery,
                    onChange: setSearchQuery,
                    label: 'Search guidelines',
                  }}
                  actions={
                    <Button type="submit" size="sm" icon={Search} loading={searching} disabled={searchQuery.length < 3}>
                      Search
                    </Button>
                  }
                />
              </form>
            </CardToolbar>

            {loading ? (
              <CardLoading label={!uploadedPdf ? 'Checking for guidelines…' : 'Loading guidelines…'} />
            ) : null}

            {!loading && activeTab === 'viewer' ? (
              pdfViewerLoading ? (
                <CardLoading label="Loading PDF…" />
              ) : pdfViewerUrl ? (
                <iframe src={pdfViewerUrl} className="cx-cg-pdf" title="Centre guidelines PDF" />
              ) : (
                <EmptyState
                  compact
                  icon={FileText}
                  title="The PDF didn’t load"
                  body="Download it instead, or upload the guidelines again."
                />
              )
            ) : null}

            {!loading && activeTab === 'chapters' && guidelinesData ? (
              <DataTable
                caption="Chapters"
                columns={chapterColumns}
                rows={chapters}
                getRowKey={(chapter) => `chapter-${chapter.number}`}
                onRowClick={(chapter) => setExpandedChapter(chapter.number)}
                empty={
                  <EmptyState
                    compact
                    icon={BookOpen}
                    title="No chapters found in this PDF"
                    body="Open the PDF tab to read it, or upload a clearer copy."
                  />
                }
              />
            ) : null}

            {!loading && activeTab === 'appendices' && guidelinesData ? (
              <DataTable
                caption="Appendices"
                columns={appendixColumns}
                rows={appendices}
                getRowKey={(appendix) => `appendix-${appendix.letter}`}
                onRowClick={(appendix) => setExpandedAppendix(appendix.letter)}
                empty={
                  <EmptyState
                    compact
                    icon={BookOpen}
                    title="No appendices found in this PDF"
                    body="Open the PDF tab to read it, or upload a clearer copy."
                  />
                }
              />
            ) : null}

            {!loading && activeTab === 'search' ? (
              <DataTable
                caption="Search results"
                columns={searchColumns}
                rows={searchResults}
                getRowKey={(result) => `hit-${result.index}`}
                empty={
                  <EmptyState
                    compact
                    icon={SearchX}
                    title={`No matches for “${searchedFor}”`}
                    body="Try a different word or phrase."
                  />
                }
              />
            ) : null}
          </Card>
        </>
      ) : (
        <Card>
          <EmptyState
            icon={FileText}
            title="No guidelines uploaded"
            body="Upload the board’s guidelines PDF to browse its chapters and appendices and search the text."
            action={
              <Button icon={Upload} onClick={() => setShowUploadModal(true)}>
                Upload guidelines
              </Button>
            }
          />
        </Card>
      )}

      <Sheet
        open={Boolean(openChapter || openAppendix)}
        onClose={closeSection}
        icon={BookOpen}
        size="lg"
        title={openChapter ? `Chapter ${openChapter.number}` : openAppendix ? `Appendix ${openAppendix.letter}` : ''}
        description={openChapter?.title ?? openAppendix?.title}
        footer={
          <>
            {openSectionPage && uploadedPdf ? (
              <Button icon={ExternalLink} onClick={() => openPdfPage(openSectionPage)}>
                Open page {openSectionPage} in PDF
              </Button>
            ) : null}
            <Button variant="primary" onClick={closeSection}>
              Done
            </Button>
          </>
        }
      >
        {openChapter ? <SectionText blocks={openChapter.formattedContent} fallback={openChapter.fullContent} /> : null}
        {openAppendix && !openChapter ? (
          <SectionText blocks={openAppendix.formattedContent} fallback={openAppendix.fullContent} />
        ) : null}
      </Sheet>

      <Dialog
        open={showUploadModal}
        onClose={uploading ? undefined : closeUpload}
        title={uploadedPdf ? 'Replace centre guidelines' : 'Upload centre guidelines'}
        description={
          uploadedPdf
            ? 'The new PDF replaces the current one. Chapters and appendices are read from it again.'
            : 'Chapters and appendices are read from the PDF so you can browse and search them.'
        }
        footer={
          <>
            <Button onClick={closeUpload} disabled={uploading}>
              Cancel
            </Button>
            <Button variant="primary" icon={Upload} onClick={() => void handleUpload()} disabled={!selectedFile} loading={uploading}>
              Upload PDF
            </Button>
          </>
        }
      >
        <div className="cb-form-section">
          <span className="cb-form-section__title">Guidelines PDF</span>
          <div
            className={`cx-cg-file${isDragging ? ' is-dragging' : ''}`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <Button icon={Paperclip} onClick={() => fileInputRef.current?.click()}>
              {selectedFile ? 'Choose another file' : 'Choose file'}
            </Button>
            <span className={selectedFile ? 'cb-strong' : 'cb-muted'}>
              {selectedFile ? selectedFile.name : 'Or drop a PDF here'}
            </span>
          </div>
          <input
            ref={fileInputRef}
            id="pdf-upload"
            type="file"
            accept=".pdf,application/pdf"
            onChange={handleFileSelect}
            aria-label="Choose the guidelines PDF"
            hidden
          />
        </div>
      </Dialog>
    </Page>
  )
}

export default CentreGuidelines
