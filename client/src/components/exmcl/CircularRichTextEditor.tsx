import React, { useEffect, useId, useRef } from 'react'
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, List, ListOrdered, Underline, type LucideIcon } from 'lucide-react'
import { Button, Select } from '@/components/ui'

type CircularRichTextEditorProps = {
  value: string
  onChange: (html: string) => void
  label?: string
  placeholder?: string
  error?: string
}

const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '36px']

const runCommand = (command: string, value?: string) => {
  document.execCommand(command, false, value)
}

const applyFontSize = (size: string) => {
  document.execCommand('styleWithCSS', false, 'true')
  document.execCommand('fontSize', false, '7')
  document.querySelectorAll('font[size="7"]').forEach((node) => {
    const span = document.createElement('span')
    span.style.fontSize = size
    span.innerHTML = node.innerHTML
    node.replaceWith(span)
  })
}

const TOOLS: Array<{ command: string; label: string; icon: LucideIcon }> = [
  { command: 'bold', label: 'Bold', icon: Bold },
  { command: 'italic', label: 'Italic', icon: Italic },
  { command: 'underline', label: 'Underline', icon: Underline },
  { command: 'insertUnorderedList', label: 'Bulleted list', icon: List },
  { command: 'insertOrderedList', label: 'Numbered list', icon: ListOrdered },
  { command: 'justifyLeft', label: 'Align left', icon: AlignLeft },
  { command: 'justifyCenter', label: 'Align centre', icon: AlignCenter },
  { command: 'justifyRight', label: 'Align right', icon: AlignRight },
]

/** Contenteditable editor for circular text, with a small formatting toolbar. Renders inside .cb-app. */
const CircularRichTextEditor: React.FC<CircularRichTextEditorProps> = ({
  value,
  onChange,
  label = 'Circular text',
  placeholder = 'Write the circular…',
  error,
}) => {
  const editorRef = useRef<HTMLDivElement>(null)
  const id = useId()

  useEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    if (editor.innerHTML !== value) {
      editor.innerHTML = value || ''
    }
  }, [value])

  const handleInput = () => {
    onChange(editorRef.current?.innerHTML || '')
  }

  const handleToolbar = (command: string, arg?: string) => {
    editorRef.current?.focus()
    if (command === 'fontSize' && arg) {
      applyFontSize(arg)
    } else {
      runCommand(command, arg)
    }
    handleInput()
  }

  return (
    <div className={error ? 'ex-editor is-invalid' : 'ex-editor'}>
      <span className="ex-editor__label" id={`${id}-l`}>
        {label}
      </span>
      <div className="ex-editor__frame">
        <div className="ex-editor__toolbar" role="toolbar" aria-label="Formatting">
          <Select
            size="sm"
            aria-label="Paragraph style"
            defaultValue=""
            onChange={(event) => {
              const next = event.target.value
              if (!next) return
              handleToolbar('formatBlock', `<${next}>`)
              event.target.value = ''
            }}
            placeholder="Style"
            options={[
              { value: 'p', label: 'Normal' },
              { value: 'h1', label: 'Heading 1' },
              { value: 'h2', label: 'Heading 2' },
              { value: 'h3', label: 'Heading 3' },
            ]}
          />
          <Select
            size="sm"
            aria-label="Text size"
            defaultValue=""
            onChange={(event) => {
              const next = event.target.value
              if (!next) return
              handleToolbar('fontSize', next)
              event.target.value = ''
            }}
            placeholder="Size"
            options={FONT_SIZES.map((size) => ({ value: size, label: size.replace('px', '') }))}
          />
          <span className="ex-editor__sep" aria-hidden="true" />
          {TOOLS.map((tool) => (
            <Button
              key={tool.command}
              variant="tertiary"
              size="sm"
              icon={tool.icon}
              aria-label={tool.label}
              title={tool.label}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => handleToolbar(tool.command)}
            />
          ))}
        </div>
        <div
          ref={editorRef}
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-labelledby={`${id}-l`}
          aria-invalid={error ? true : undefined}
          data-placeholder={placeholder}
          onInput={handleInput}
          className="ex-editor__area ex-richtext"
        />
      </div>
      {error ? <div className="cb-field__error">{error}</div> : null}
    </div>
  )
}

export default CircularRichTextEditor
