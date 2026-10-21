import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Cropper, { type Area } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'

type CropFrame = { x: number; y: number; width: number; height: number }

type ResizeHandle =
  | 'n'
  | 's'
  | 'e'
  | 'w'
  | 'ne'
  | 'nw'
  | 'se'
  | 'sw'

type ImageCropModalProps = {
  imageSrc: string
  open: boolean
  title?: string
  hint?: string
  /** Fixed aspect ratio. Ignored while free crop is active. */
  aspect?: number
  /** Show Free / Fixed toggle. Defaults to true. */
  allowFreeCrop?: boolean
  /** Start in free crop mode. Defaults to false. */
  defaultFreeCrop?: boolean
  fileNamePrefix?: string
  onCancel: () => void
  onCropped: (file: File, previewUrl: string) => void
}

const CROP_MIN = 80
const STAGE_INSET = 12
const MIN_ZOOM = 0.2
const MAX_ZOOM = 3

const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  sw: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
}

const createImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image()
    image.addEventListener('load', () => resolve(image))
    image.addEventListener('error', (error) => reject(error))
    image.setAttribute('crossOrigin', 'anonymous')
    image.src = url
  })

const getCroppedBlob = async (
  imageSrc: string,
  pixelCrop: Area,
  aspect: number | null
): Promise<Blob> => {
  const image = await createImage(imageSrc)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not create canvas context')

  let outputWidth: number
  let outputHeight: number

  if (aspect && aspect > 0) {
    const minEdge = Math.max(Math.round(Math.min(pixelCrop.width, pixelCrop.height)), 256)
    outputWidth = aspect >= 1
      ? Math.max(Math.round(minEdge * aspect), 256)
      : minEdge
    outputHeight = aspect >= 1
      ? minEdge
      : Math.max(Math.round(minEdge / aspect), 256)
  } else {
    const scale = Math.max(256 / Math.max(pixelCrop.width, pixelCrop.height, 1), 1)
    outputWidth = Math.max(Math.round(pixelCrop.width * scale), 1)
    outputHeight = Math.max(Math.round(pixelCrop.height * scale), 1)
  }

  canvas.width = outputWidth
  canvas.height = outputHeight

  ctx.drawImage(
    image,
    pixelCrop.x,
    pixelCrop.y,
    pixelCrop.width,
    pixelCrop.height,
    0,
    0,
    outputWidth,
    outputHeight
  )

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Failed to crop image'))
          return
        }
        resolve(blob)
      },
      'image/jpeg',
      0.92
    )
  })
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max)

const defaultFreeFrame = (
  aspect: number,
  stageW: number,
  stageH: number
): CropFrame => {
  const ratio = aspect > 0 ? aspect : 3 / 2
  const maxW = Math.max(CROP_MIN, stageW - STAGE_INSET * 2)
  const maxH = Math.max(CROP_MIN, stageH - STAGE_INSET * 2)
  let width = Math.min(Math.round(maxW * 0.72), maxW)
  let height = Math.round(width / ratio)
  if (height > maxH) {
    height = maxH
    width = Math.round(height * ratio)
  }
  width = Math.max(CROP_MIN, width)
  height = Math.max(CROP_MIN, height)
  return {
    x: Math.round((stageW - width) / 2),
    y: Math.round((stageH - height) / 2),
    width,
    height,
  }
}

const resizeFrame = (
  start: CropFrame,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  stageW: number,
  stageH: number
): CropFrame => {
  let { x, y, width, height } = start
  const minX = STAGE_INSET
  const minY = STAGE_INSET
  const maxRight = stageW - STAGE_INSET
  const maxBottom = stageH - STAGE_INSET

  if (handle.includes('e')) {
    width = clamp(start.width + dx, CROP_MIN, maxRight - start.x)
  }
  if (handle.includes('s')) {
    height = clamp(start.height + dy, CROP_MIN, maxBottom - start.y)
  }
  if (handle.includes('w')) {
    const maxDx = start.width - CROP_MIN
    const minDx = minX - start.x
    const applied = clamp(dx, minDx, maxDx)
    x = start.x + applied
    width = start.width - applied
  }
  if (handle.includes('n')) {
    const maxDy = start.height - CROP_MIN
    const minDy = minY - start.y
    const applied = clamp(dy, minDy, maxDy)
    y = start.y + applied
    height = start.height - applied
  }

  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(width),
    height: Math.round(height),
  }
}

const pixelsFromFreeFrame = (
  frame: CropFrame,
  pan: { x: number; y: number },
  zoom: number,
  stageW: number,
  stageH: number,
  naturalW: number,
  naturalH: number
): Area | null => {
  if (!naturalW || !naturalH || !stageW || !stageH) return null

  const baseScale = Math.max(stageW / naturalW, stageH / naturalH)
  const displayScale = baseScale * zoom
  const imgW = naturalW * displayScale
  const imgH = naturalH * displayScale
  const imgLeft = (stageW - imgW) / 2 + pan.x
  const imgTop = (stageH - imgH) / 2 + pan.y

  const x = (frame.x - imgLeft) / displayScale
  const y = (frame.y - imgTop) / displayScale
  const width = frame.width / displayScale
  const height = frame.height / displayScale

  const clippedX = clamp(x, 0, naturalW)
  const clippedY = clamp(y, 0, naturalH)
  const clippedW = clamp(width, 1, naturalW - clippedX)
  const clippedH = clamp(height, 1, naturalH - clippedY)

  if (clippedW < 1 || clippedH < 1) return null

  return {
    x: Math.round(clippedX),
    y: Math.round(clippedY),
    width: Math.round(clippedW),
    height: Math.round(clippedH),
  }
}

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  imageSrc,
  open,
  title = 'Crop image',
  hint,
  aspect = 1,
  allowFreeCrop = true,
  defaultFreeCrop = false,
  fileNamePrefix = 'cropped-image',
  onCancel,
  onCropped,
}) => {
  const stageRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<CropFrame>({ x: 40, y: 40, width: 280, height: 186 })
  const stageSizeRef = useRef({ width: 520, height: 360 })
  const panRef = useRef({ x: 0, y: 0 })
  const naturalRef = useRef({ width: 0, height: 0 })
  const resizeRef = useRef<{
    handle: ResizeHandle
    startX: number
    startY: number
    startFrame: CropFrame
  } | null>(null)
  const panDragRef = useRef<{
    startX: number
    startY: number
    origin: { x: number; y: number }
  } | null>(null)

  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [freeCrop, setFreeCrop] = useState(Boolean(defaultFreeCrop))
  const [frame, setFrame] = useState<CropFrame>({ x: 40, y: 40, width: 280, height: 186 })
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [stageSize, setStageSize] = useState({ width: 520, height: 360 })
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 })
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
  const [processing, setProcessing] = useState(false)
  const [resizing, setResizing] = useState(false)
  const [panning, setPanning] = useState(false)

  frameRef.current = frame
  stageSizeRef.current = stageSize
  panRef.current = pan
  naturalRef.current = naturalSize

  const measureStage = useCallback(() => {
    const el = stageRef.current
    if (!el) return { width: 520, height: 360 }
    return {
      width: Math.max(CROP_MIN, Math.floor(el.clientWidth)),
      height: Math.max(CROP_MIN, Math.floor(el.clientHeight)),
    }
  }, [])

  const syncFreePixels = useCallback(
    (
      nextFrame = frameRef.current,
      nextPan = panRef.current,
      nextZoom = zoom,
      nextStage = stageSizeRef.current,
      nextNatural = naturalRef.current
    ) => {
      setCroppedAreaPixels(
        pixelsFromFreeFrame(
          nextFrame,
          nextPan,
          nextZoom,
          nextStage.width,
          nextStage.height,
          nextNatural.width,
          nextNatural.height
        )
      )
    },
    [zoom]
  )

  useEffect(() => {
    if (!open) return
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setPan({ x: 0, y: 0 })
    setFreeCrop(Boolean(defaultFreeCrop))
    setCroppedAreaPixels(null)
    setResizing(false)
    setPanning(false)
    resizeRef.current = null
    panDragRef.current = null

    void createImage(imageSrc).then((img) => {
      naturalRef.current = { width: img.naturalWidth, height: img.naturalHeight }
      setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight })
    })

    const frameId = requestAnimationFrame(() => {
      const size = measureStage()
      setStageSize(size)
      const next = defaultFreeFrame(aspect, size.width, size.height)
      setFrame(next)
      frameRef.current = next
    })
    return () => cancelAnimationFrame(frameId)
  }, [open, imageSrc, defaultFreeCrop, aspect, measureStage])

  useEffect(() => {
    if (!open || !freeCrop) return
    syncFreePixels()
  }, [open, freeCrop, frame, pan, zoom, stageSize, naturalSize, syncFreePixels])

  useEffect(() => {
    if (!resizing) return

    const onPointerMove = (event: PointerEvent) => {
      const active = resizeRef.current
      if (!active) return
      const dx = event.clientX - active.startX
      const dy = event.clientY - active.startY
      const size = stageSizeRef.current
      const next = resizeFrame(
        active.startFrame,
        active.handle,
        dx,
        dy,
        size.width,
        size.height
      )
      setFrame(next)
    }

    const onPointerUp = () => {
      resizeRef.current = null
      setResizing(false)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [resizing])

  useEffect(() => {
    if (!panning) return

    const onPointerMove = (event: PointerEvent) => {
      const active = panDragRef.current
      if (!active) return
      setPan({
        x: active.origin.x + (event.clientX - active.startX),
        y: active.origin.y + (event.clientY - active.startY),
      })
    }

    const onPointerUp = () => {
      panDragRef.current = null
      setPanning(false)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerUp)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [panning])

  const enableFreeCrop = () => {
    const size = measureStage()
    setStageSize(size)
    setFrame((prev) => {
      const width = clamp(prev.width, CROP_MIN, size.width - STAGE_INSET * 2)
      const height = clamp(prev.height, CROP_MIN, size.height - STAGE_INSET * 2)
      return {
        width,
        height,
        x: clamp(prev.x, STAGE_INSET, size.width - STAGE_INSET - width),
        y: clamp(prev.y, STAGE_INSET, size.height - STAGE_INSET - height),
      }
    })
    setFreeCrop(true)
  }

  const beginResize = (handle: ResizeHandle) => (event: React.PointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    resizeRef.current = {
      handle,
      startX: event.clientX,
      startY: event.clientY,
      startFrame: { ...frameRef.current },
    }
    setResizing(true)
  }

  const beginPan = (event: React.PointerEvent) => {
    if (event.button !== 0) return
    event.preventDefault()
    panDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...panRef.current },
    }
    setPanning(true)
  }

  const onCropComplete = useCallback((_croppedArea: Area, croppedPixels: Area) => {
    setCroppedAreaPixels(croppedPixels)
  }, [])

  if (!open) return null

  const tip =
    hint ||
    (freeCrop
      ? 'Drag the image to reposition. Drag one edge or corner to resize that side only.'
      : aspect === 1
        ? 'Fixed square crop — drag to reposition, then adjust zoom.'
        : 'Fixed crop — drag to reposition, then adjust zoom.')

  const handleApply = async () => {
    if (!croppedAreaPixels) return
    setProcessing(true)
    try {
      const blob = await getCroppedBlob(
        imageSrc,
        croppedAreaPixels,
        freeCrop ? null : aspect
      )
      const file = new File([blob], `${fileNamePrefix}-${Date.now()}.jpg`, { type: 'image/jpeg' })
      const previewUrl = URL.createObjectURL(file)
      onCropped(file, previewUrl)
    } catch (error) {
      console.error(error)
    } finally {
      setProcessing(false)
    }
  }

  const handleClass =
    'absolute z-20 touch-none rounded-full border-2 border-white bg-indigo-500 shadow-md'

  const freeImageStyle = (): React.CSSProperties => {
    if (!naturalSize.width || !stageSize.width) {
      return { opacity: 0 }
    }
    const baseScale = Math.max(
      stageSize.width / naturalSize.width,
      stageSize.height / naturalSize.height
    )
    const displayScale = baseScale * zoom
    const imgW = naturalSize.width * displayScale
    const imgH = naturalSize.height * displayScale
    return {
      width: imgW,
      height: imgH,
      left: (stageSize.width - imgW) / 2 + pan.x,
      top: (stageSize.height - imgH) / 2 + pan.y,
      maxWidth: 'none',
    }
  }

  // Portalled above kit Sheets/Dialogs (z-100), which it usually opens from.
  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/55 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-xl overflow-hidden rounded-[24px] bg-white dark:bg-gray-800 shadow-2xl">
        <div className="border-b border-slate-100 dark:border-gray-700 px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-gray-100">{title}</h3>
              <p className="mt-1 text-sm text-slate-500">{tip}</p>
            </div>
            {allowFreeCrop ? (
              <div className="inline-flex shrink-0 rounded-xl border border-slate-200 dark:border-gray-700 p-0.5 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setFreeCrop(false)}
                  className={`rounded-lg px-2.5 py-1.5 ${
                    !freeCrop ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Fixed
                </button>
                <button
                  type="button"
                  onClick={enableFreeCrop}
                  className={`rounded-lg px-2.5 py-1.5 ${
                    freeCrop ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Free
                </button>
              </div>
            ) : null}
          </div>
        </div>

        <div
          ref={stageRef}
          className={`relative h-[360px] overflow-hidden bg-slate-950 ${
            resizing || panning ? 'select-none' : ''
          }`}
        >
          {freeCrop ? (
            <>
              <img
                src={imageSrc}
                alt=""
                draggable={false}
                className="absolute max-w-none cursor-grab active:cursor-grabbing"
                style={freeImageStyle()}
                onPointerDown={beginPan}
              />

              {/* Dim outside the crop frame */}
              <div className="pointer-events-none absolute inset-0">
                <div
                  className="absolute inset-x-0 top-0 bg-black/45"
                  style={{ height: Math.max(frame.y, 0) }}
                />
                <div
                  className="absolute inset-x-0 bottom-0 bg-black/45"
                  style={{ height: Math.max(stageSize.height - frame.y - frame.height, 0) }}
                />
                <div
                  className="absolute bg-black/45"
                  style={{
                    top: frame.y,
                    height: frame.height,
                    left: 0,
                    width: Math.max(frame.x, 0),
                  }}
                />
                <div
                  className="absolute bg-black/45"
                  style={{
                    top: frame.y,
                    height: frame.height,
                    left: frame.x + frame.width,
                    right: 0,
                  }}
                />
              </div>

              <div
                className="pointer-events-none absolute z-10 border border-white shadow-[0_0_0_1px_rgba(15,23,42,0.35)]"
                style={{
                  left: frame.x,
                  top: frame.y,
                  width: frame.width,
                  height: frame.height,
                }}
              >
                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
                  {Array.from({ length: 9 }).map((_, index) => (
                    <div key={index} className="border border-white/25" />
                  ))}
                </div>

                <button
                  type="button"
                  aria-label="Resize top"
                  className={`${handleClass} pointer-events-auto left-1/2 top-0 h-2.5 w-10 -translate-x-1/2 -translate-y-1/2`}
                  style={{ cursor: HANDLE_CURSORS.n }}
                  onPointerDown={beginResize('n')}
                />
                <button
                  type="button"
                  aria-label="Resize bottom"
                  className={`${handleClass} pointer-events-auto bottom-0 left-1/2 h-2.5 w-10 -translate-x-1/2 translate-y-1/2`}
                  style={{ cursor: HANDLE_CURSORS.s }}
                  onPointerDown={beginResize('s')}
                />
                <button
                  type="button"
                  aria-label="Resize left"
                  className={`${handleClass} pointer-events-auto left-0 top-1/2 h-10 w-2.5 -translate-x-1/2 -translate-y-1/2`}
                  style={{ cursor: HANDLE_CURSORS.w }}
                  onPointerDown={beginResize('w')}
                />
                <button
                  type="button"
                  aria-label="Resize right"
                  className={`${handleClass} pointer-events-auto right-0 top-1/2 h-10 w-2.5 translate-x-1/2 -translate-y-1/2`}
                  style={{ cursor: HANDLE_CURSORS.e }}
                  onPointerDown={beginResize('e')}
                />

                {(
                  [
                    ['nw', 'left-0 top-0 -translate-x-1/2 -translate-y-1/2'],
                    ['ne', 'right-0 top-0 translate-x-1/2 -translate-y-1/2'],
                    ['sw', 'bottom-0 left-0 -translate-x-1/2 translate-y-1/2'],
                    ['se', 'bottom-0 right-0 translate-x-1/2 translate-y-1/2'],
                  ] as const
                ).map(([handle, positionClass]) => (
                  <button
                    key={handle}
                    type="button"
                    aria-label={`Resize ${handle}`}
                    className={`${handleClass} pointer-events-auto h-3.5 w-3.5 ${positionClass}`}
                    style={{ cursor: HANDLE_CURSORS[handle] }}
                    onPointerDown={beginResize(handle)}
                  />
                ))}
              </div>
            </>
          ) : (
            <Cropper
              key={`fixed-${aspect}`}
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              restrictPosition={false}
              aspect={aspect}
              cropShape="rect"
              showGrid
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>

        <div className="space-y-4 px-5 py-4">
          <label className="block text-sm text-slate-600">
            <span className="mb-2 flex items-center justify-between">
              <span>Zoom</span>
              <span className="text-xs text-slate-400">{zoom.toFixed(2)}x</span>
            </span>
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.05}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="w-full accent-indigo-600"
            />
            <span className="mt-1 block text-[11px] text-slate-400">
              Drag left to zoom out and fit the full image inside the crop box.
            </span>
          </label>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={processing}
              className="rounded-xl border border-slate-200 dark:border-gray-700 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleApply()}
              disabled={processing || !croppedAreaPixels}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {processing ? 'Applying...' : 'Apply crop'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default ImageCropModal
