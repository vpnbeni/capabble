import React, { useRef } from 'react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ImagePlus,
  Italic,
  Minus,
  Square,
  Trash2,
  Type,
  Underline,
  type LucideIcon,
} from 'lucide-react'
import {
  FONT_SIZES,
  FORMAT_FONTS,
  PAGE_ASPECT,
  PAGE_LABEL,
  PAGE_SIZE_MM,
  fontFamilyToCss,
  type FormatCanvasItem,
  type FormatFontFamily,
  type FormatOrientation,
  type FormatPageSize,
  type FormatTextStyle,
} from '@/components/format-editor/types'
import { cx } from './format'
import { Button } from './primitives'
import { Select } from './forms'

/**
 * Print previews: a sunken stage with sheets of paper on it, plus the toolbar the
 * format designers put above the stage. The paper is the printed document, so it
 * stays white with black ink in both themes (see .cb-paper in app.css).
 */

/** Sunken ground the paper sits on. `flush` = edge to edge under a flush card's head; `state` replaces the paper (loading, empty, error). */
export const PaperStage: React.FC<{
  flush?: boolean
  state?: React.ReactNode
  className?: string
  children?: React.ReactNode
}> = ({ flush, state, className, children }) => (
  <div className={cx('cb-paper-stage', flush && 'cb-paper-stage--flush', className)}>
    {state ? <div className="cb-paper-stage__state">{state}</div> : children}
  </div>
)

/** Class for a wrapper that stacks several pages (e.g. a react-pdf Document) inside a PaperStage. */
export const PAPER_PAGES_CLASS = 'cb-paper-stage__pages'

const PORTRAIT_WIDTH = 640

/**
 * A sheet of paper at real proportions. Without `pageSize` it hugs an already-rendered
 * page (a PDF canvas). `fixed` keeps the page height and scrolls overflowing content
 * inside it; otherwise the page grows with its content. `width` caps the width in px
 * (portrait defaults to 640, landscape fills the stage).
 */
export const Paper: React.FC<{
  pageSize?: FormatPageSize
  orientation?: FormatOrientation
  width?: number
  fixed?: boolean
  caption?: boolean
  className?: string
  children?: React.ReactNode
}> = ({ pageSize, orientation = 'portrait', width, fixed, caption, className, children }) => {
  if (!pageSize) return <div className={cx('cb-paper', 'cb-paper--fit', className)}>{children}</div>

  const maxWidth = width ?? (orientation === 'portrait' ? PORTRAIT_WIDTH : undefined)
  const base = PAGE_SIZE_MM[pageSize] || PAGE_SIZE_MM.A4
  const [widthMm, heightMm] = orientation === 'landscape' ? [base.height, base.width] : [base.width, base.height]
  const style = {
    aspectRatio: (PAGE_ASPECT[pageSize] || PAGE_ASPECT.A4)[orientation],
    ...(maxWidth ? { '--cb-paper-width': `${maxWidth}px` } : {}),
  } as React.CSSProperties

  return (
    <div className="cb-paper-frame">
      <div
        className={cx('cb-paper', fixed && 'cb-paper--fixed', className)}
        style={style}
        data-page-size={pageSize}
        data-orientation={orientation}
      >
        <div className="cb-paper__body">
          {/* Positioned layer: a CanvasOverlay placed here lines up with the content box. */}
          <div className="cb-paper__layer">{children}</div>
        </div>
      </div>
      {caption ? (
        <p className="cb-paper-caption">
          {PAGE_LABEL[pageSize]} · {orientation === 'portrait' ? 'Portrait' : 'Landscape'} · {widthMm.toFixed(0)} ×{' '}
          {heightMm.toFixed(0)} mm
        </p>
      ) : null}
    </div>
  )
}

/** One or two copies side by side on a sheet, with a dashed cut line between two. */
export const PaperCopies: React.FC<{ count: 1 | 2; children: React.ReactNode }> = ({ count, children }) => (
  <div className={cx('cb-paper-copies', count === 2 && 'cb-paper-copies--two')}>
    {Array.from({ length: count }, (_, index) => (
      <div key={index} className="cb-paper-copies__copy">
        {children}
      </div>
    ))}
  </div>
)

/* ---------- Format designer toolbar ---------- */

const ToolToggle: React.FC<{
  icon: LucideIcon
  label: string
  on: boolean
  disabled?: boolean
  onClick: () => void
}> = ({ icon, label, on, disabled, onClick }) => (
  <Button
    variant="tertiary"
    size="sm"
    icon={icon}
    aria-label={label}
    title={label}
    aria-pressed={on}
    disabled={disabled}
    className={cx('cb-format-tools__toggle', on && 'is-on')}
    onClick={onClick}
  />
)

/**
 * Canvas tools strip for the format designers: add text / image / box / line, then
 * font, size, bold / italic / underline, colour and alignment for the selection.
 * Sits between a flush card's head and its PaperStage.
 */
export const FormatToolbar: React.FC<{
  label?: string
  selectionLabel: string
  style: FormatTextStyle
  styleDisabled?: boolean
  canvasItem: FormatCanvasItem | null
  uploadingImage?: boolean
  disabled?: boolean
  onStyleChange: (partial: Partial<FormatTextStyle>) => void
  onAddText: () => void
  onAddImage: (file?: File) => void
  onAddRect: () => void
  onAddLine: () => void
  onPatchCanvas: (patch: Partial<FormatCanvasItem>) => void
  onDelete: () => void
}> = ({
  label = 'Canvas tools',
  selectionLabel,
  style,
  styleDisabled,
  canvasItem,
  uploadingImage,
  disabled,
  onStyleChange,
  onAddText,
  onAddImage,
  onAddRect,
  onAddLine,
  onPatchCanvas,
  onDelete,
}) => {
  const fileRef = useRef<HTMLInputElement>(null)
  const isText = canvasItem?.type === 'text'
  const isShape = canvasItem?.type === 'rect' || canvasItem?.type === 'line'
  const fontDisabled = Boolean(disabled || styleDisabled || canvasItem?.type === 'image' || isShape)
  const colorValue = isShape ? canvasItem.fill || canvasItem.stroke || '#000000' : canvasItem?.color || '#000000'
  const sizes = Array.from(new Set([...FONT_SIZES, style.fontSize])).sort((a, b) => a - b)

  return (
    <div className="cb-format-tools" role="toolbar" aria-label={label}>
      <div className="cb-format-tools__group">
        <Button variant="tertiary" size="sm" icon={Type} onClick={onAddText} disabled={disabled}>
          Text
        </Button>
        <Button
          variant="tertiary"
          size="sm"
          icon={ImagePlus}
          loading={uploadingImage}
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
        >
          {uploadingImage ? 'Uploading…' : 'Image'}
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="cb-visually-hidden"
          tabIndex={-1}
          aria-hidden="true"
          disabled={uploadingImage}
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            onAddImage(file)
          }}
        />
        <Button variant="tertiary" size="sm" icon={Square} onClick={onAddRect} disabled={disabled}>
          Box
        </Button>
        <Button variant="tertiary" size="sm" icon={Minus} onClick={onAddLine} disabled={disabled}>
          Line
        </Button>
      </div>
      <span className="cb-format-tools__sep" aria-hidden="true" />
      <span className="cb-format-tools__label">{selectionLabel}</span>
      <Select
        aria-label="Font"
        size="sm"
        className="cb-format-tools__font"
        value={style.fontFamily}
        disabled={fontDisabled}
        onChange={(event) => onStyleChange({ fontFamily: event.target.value as FormatFontFamily })}
        style={{ fontFamily: fontFamilyToCss(style.fontFamily) }}
        options={FORMAT_FONTS.map((font) => ({ value: font.id, label: font.label }))}
      />
      <Select
        aria-label="Font size"
        size="sm"
        className="cb-format-tools__size"
        value={String(style.fontSize)}
        disabled={fontDisabled}
        onChange={(event) => onStyleChange({ fontSize: Number(event.target.value) })}
        options={sizes.map((size) => ({ value: String(size), label: `${size} px` }))}
      />
      <div className="cb-format-tools__group">
        <ToolToggle icon={Bold} label="Bold" on={style.bold} disabled={fontDisabled} onClick={() => onStyleChange({ bold: !style.bold })} />
        <ToolToggle icon={Italic} label="Italic" on={style.italic} disabled={fontDisabled} onClick={() => onStyleChange({ italic: !style.italic })} />
        <ToolToggle
          icon={Underline}
          label="Underline"
          on={style.underline}
          disabled={fontDisabled}
          onClick={() => onStyleChange({ underline: !style.underline })}
        />
      </div>
      {isText || isShape ? (
        <>
          <span className="cb-format-tools__sep" aria-hidden="true" />
          <label className="cb-format-tools__color" title={isShape ? 'Colour' : 'Text colour'}>
            <span className="cb-visually-hidden">{isShape ? 'Colour' : 'Text colour'}</span>
            <input
              type="color"
              value={colorValue}
              onChange={(event) =>
                onPatchCanvas(
                  isShape
                    ? { fill: event.target.value, stroke: event.target.value, color: event.target.value }
                    : { color: event.target.value }
                )
              }
            />
          </label>
        </>
      ) : null}
      {isText && canvasItem ? (
        <div className="cb-format-tools__group">
          <ToolToggle icon={AlignLeft} label="Align left" on={canvasItem.align === 'left'} onClick={() => onPatchCanvas({ align: 'left' })} />
          <ToolToggle icon={AlignCenter} label="Align centre" on={canvasItem.align === 'center'} onClick={() => onPatchCanvas({ align: 'center' })} />
          <ToolToggle icon={AlignRight} label="Align right" on={canvasItem.align === 'right'} onClick={() => onPatchCanvas({ align: 'right' })} />
        </div>
      ) : null}
      {canvasItem ? (
        <Button variant="tertiary" size="sm" icon={Trash2} onClick={onDelete}>
          Delete {selectionLabel.toLowerCase()}
        </Button>
      ) : null}
    </div>
  )
}
