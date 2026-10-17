# Dialog Component

A modern, production-grade Dialog component with comprehensive features, beautiful animations, and complete accessibility support.

## Features

✨ **Modern Animations** - Powered by Framer Motion with 6 animation styles  
🎨 **Multiple Variants** - Default, Success, Warning, Error, Info  
📏 **Flexible Sizing** - 6 size options from xs to full  
🎯 **Smart Positioning** - Center, top, bottom, left (drawer), right (drawer)  
♿ **Fully Accessible** - ARIA compliant with focus trap and keyboard navigation  
🔄 **Async Support** - Handle async operations with loading states  
🎭 **Compound Components** - Flexible API for custom layouts  
🌙 **Dark Mode** - Full support with existing design tokens  
📱 **Mobile Responsive** - Optimized for all screen sizes  
🎪 **Portal Rendering** - Optional portal rendering to document.body  
🔐 **Focus Management** - Automatic focus trap and restoration  
⌨️ **Keyboard Support** - Escape to close, Tab navigation  
🎨 **Customizable** - Extensive styling options and class overrides  

---

## Installation

The Dialog component is already part of the project. Simply import and use:

```tsx
import { Dialog } from '@/components/common/Dialog'
```

---

## Basic Usage

### Simple Dialog

```tsx
import { Dialog } from '@/components/common/Dialog'

function MyComponent() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button onClick={() => setIsOpen(true)}>Open Dialog</button>
      
      <Dialog
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Welcome"
      >
        <p>This is a simple dialog with default settings.</p>
      </Dialog>
    </>
  )
}
```

### With Actions

```tsx
<Dialog
  isOpen={isOpen}
  onClose={onClose}
  title="Confirm Action"
  variant="warning"
  icon={<AlertTriangle />}
  actions={[
    { label: 'Cancel', onClick: onClose, variant: 'ghost' },
    { label: 'Confirm', onClick: handleConfirm, variant: 'primary' }
  ]}
>
  <p>Are you sure you want to proceed?</p>
</Dialog>
```

---

## Props API

### Core Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isOpen` | `boolean` | required | Controls dialog visibility |
| `onClose` | `() => void` | required | Callback when dialog closes |

### Content Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `title` | `ReactNode` | - | Dialog title (displayed in header) |
| `description` | `ReactNode` | - | Optional description below title |
| `children` | `ReactNode` | required | Dialog content |
| `icon` | `ReactNode` | - | Icon displayed next to title |

### Style Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'default' \| 'success' \| 'warning' \| 'error' \| 'info'` | `'default'` | Dialog color scheme |
| `size` | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl' \| 'full'` | `'md'` | Dialog width |
| `position` | `'center' \| 'top' \| 'bottom' \| 'left' \| 'right'` | `'center'` | Dialog position |
| `animation` | `'scale' \| 'slide-up' \| 'slide-down' \| 'slide-left' \| 'slide-right' \| 'fade'` | `'scale'` | Entrance animation |
| `rounded` | `'rounded' \| 'square' \| 'pill'` | `'rounded'` | Corner style |

### Behavior Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `closeOnBackdrop` | `boolean` | `true` | Close when clicking backdrop |
| `closeOnEscape` | `boolean` | `true` | Close when pressing Escape |
| `showCloseButton` | `boolean` | `true` | Show close button |
| `closeButtonPosition` | `'inside' \| 'outside'` | `'inside'` | Close button position |
| `preventBodyScroll` | `boolean` | `true` | Lock body scroll when open |
| `portal` | `boolean` | `true` | Render in portal |

### Advanced Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `draggable` | `boolean` | `false` | Enable drag to move |
| `maxHeight` | `string \| number` | - | Maximum dialog height |
| `minHeight` | `string \| number` | - | Minimum dialog height |
| `onBeforeClose` | `() => boolean \| Promise<boolean>` | - | Validation before closing |
| `initialFocus` | `RefObject<HTMLElement>` | - | Element to focus on open |
| `stackOrder` | `number` | - | Custom z-index |
| `loading` | `boolean` | `false` | Show loading overlay |

### Backdrop Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `backdropBlur` | `'none' \| 'sm' \| 'md' \| 'lg'` | `'sm'` | Backdrop blur amount |
| `backdropOpacity` | `number` | `0.5` | Backdrop opacity (0-1) |

### Actions Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `actions` | `DialogAction[]` | - | Footer action buttons |

**DialogAction Interface:**

```tsx
interface DialogAction {
  label: string
  onClick: () => void | Promise<void>
  variant?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'outline' | 'ghost'
  loading?: boolean
  disabled?: boolean
  icon?: ReactNode
}
```

### Styling Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `className` | `string` | - | Dialog wrapper classes |
| `contentClassName` | `string` | - | Content wrapper classes |
| `headerClassName` | `string` | - | Header classes |
| `bodyClassName` | `string` | - | Body classes |
| `footerClassName` | `string` | - | Footer classes |
| `overlayClassName` | `string` | - | Backdrop classes |

---

## Compound Components

For maximum flexibility, use compound components:

```tsx
<Dialog isOpen={isOpen} onClose={onClose}>
  <Dialog.Header icon={<CheckIcon />} showClose>
    Custom Header
  </Dialog.Header>
  
  <Dialog.Body className="space-y-4">
    <p>Full control over content layout.</p>
    <div className="bg-blue-50 p-4 rounded">
      Custom sections with styling
    </div>
  </Dialog.Body>
  
  <Dialog.Footer align="space-between">
    <button className="btn btn-ghost">Secondary</button>
    <button className="btn btn-primary">Primary</button>
  </Dialog.Footer>
</Dialog>
```

### Dialog.Header

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | required | Header content |
| `icon` | `ReactNode` | - | Header icon |
| `showClose` | `boolean` | `true` | Show close button |
| `className` | `string` | - | Custom classes |

### Dialog.Body

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | required | Body content |
| `className` | `string` | - | Custom classes |

### Dialog.Footer

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | required | Footer content |
| `className` | `string` | - | Custom classes |
| `align` | `'left' \| 'center' \| 'right' \| 'space-between'` | `'right'` | Button alignment |

---

## Examples

### 1. Confirmation Dialog

```tsx
<Dialog
  isOpen={isOpen}
  onClose={onClose}
  variant="warning"
  size="sm"
  title="Delete Item"
  icon={<AlertTriangle className="w-6 h-6" />}
  actions={[
    { label: 'Cancel', onClick: onClose, variant: 'ghost' },
    { label: 'Delete', onClick: handleDelete, variant: 'error' }
  ]}
>
  Are you sure you want to delete this item? This action cannot be undone.
</Dialog>
```

### 2. Form Dialog with Validation

```tsx
<Dialog
  isOpen={isOpen}
  onClose={onClose}
  size="lg"
  title="Edit Profile"
  animation="slide-up"
  onBeforeClose={async () => {
    if (hasUnsavedChanges) {
      return window.confirm('You have unsaved changes. Close anyway?')
    }
    return true
  }}
>
  <form onSubmit={handleSubmit}>
    {/* form fields */}
  </form>
</Dialog>
```

### 3. Side Panel (Drawer)

```tsx
<Dialog
  isOpen={isOpen}
  onClose={onClose}
  position="right"
  size="md"
  animation="slide-left"
  title="Settings"
>
  {/* Settings content */}
</Dialog>
```

### 4. Loading State

```tsx
<Dialog
  isOpen={isOpen}
  onClose={onClose}
  title="Processing"
  loading={isProcessing}
  actions={[
    { 
      label: 'Submit', 
      onClick: handleSubmit, 
      variant: 'primary',
      loading: isProcessing 
    }
  ]}
>
  <p>Your request is being processed...</p>
</Dialog>
```

### 5. Success Message

```tsx
<Dialog
  isOpen={isOpen}
  onClose={onClose}
  variant="success"
  size="sm"
  title="Success"
  icon={<Check className="w-6 h-6" />}
  animation="scale"
>
  <p>Your changes have been saved successfully!</p>
</Dialog>
```

### 6. Nested Dialogs

```tsx
// Automatically handles z-index stacking
<>
  <Dialog isOpen={dialog1Open} onClose={() => setDialog1Open(false)}>
    <button onClick={() => setDialog2Open(true)}>Open Another</button>
  </Dialog>
  
  <Dialog isOpen={dialog2Open} onClose={() => setDialog2Open(false)}>
    This dialog appears on top!
  </Dialog>
</>
```

---

## Animations

The Dialog component supports 6 animation types:

- **scale** (default) - Zoom in/out with spring physics
- **slide-up** - Slide from bottom
- **slide-down** - Slide from top  
- **slide-left** - Slide from right (great for drawers)
- **slide-right** - Slide from left
- **fade** - Simple fade in/out

```tsx
<Dialog animation="slide-up" {...props}>
  Content
</Dialog>
```

---

## Sizes

| Size | Width | Use Case |
|------|-------|----------|
| `xs` | 320px | Tiny alerts, confirmations |
| `sm` | 480px | Small forms, simple content |
| `md` | 640px | Default, most dialogs |
| `lg` | 800px | Large forms, detailed content |
| `xl` | 1024px | Complex layouts, tables |
| `full` | 90vw | Maximum width dialogs |

---

## Positions

| Position | Behavior | Use Case |
|----------|----------|----------|
| `center` | Centered in viewport | Default, most dialogs |
| `top` | Top of viewport with padding | Notifications, alerts |
| `bottom` | Bottom of viewport with padding | Action sheets |
| `left` | Full height, left edge | Side panel, navigation |
| `right` | Full height, right edge | Settings, filters |

---

## Accessibility

The Dialog component is fully accessible and follows WAI-ARIA best practices:

### ARIA Attributes

- `role="dialog"` - Identifies as dialog
- `aria-modal="true"` - Prevents interaction with background
- `aria-labelledby` - Links to title element
- `aria-describedby` - Links to description element

### Focus Management

- **Focus Trap** - Tab cycles through dialog elements only
- **Auto Focus** - Focuses first interactive element on open
- **Focus Restoration** - Returns focus to trigger on close
- **Initial Focus** - Set custom initial focus with `initialFocus` prop

### Keyboard Support

- **Escape** - Closes dialog (if `closeOnEscape={true}`)
- **Tab** - Navigate forward through focusable elements
- **Shift+Tab** - Navigate backward through focusable elements

### Screen Reader Support

- Dialog announces when opened
- Backdrop hides background content from screen readers
- Proper labeling for all interactive elements

---

## Best Practices

### 1. Use Appropriate Variants

```tsx
// Success - confirmations, completions
<Dialog variant="success" />

// Warning - destructive actions, important notices
<Dialog variant="warning" />

// Error - failures, validation errors
<Dialog variant="error" />

// Info - helpful information, tips
<Dialog variant="info" />
```

### 2. Size Appropriately

- Start with `md` for most dialogs
- Use `sm` for simple confirmations
- Use `lg` or `xl` for complex forms
- Avoid `full` unless absolutely necessary

### 3. Validation Before Close

```tsx
<Dialog
  onBeforeClose={async () => {
    if (isDirty) {
      return confirm('Discard changes?')
    }
    return true
  }}
>
  {/* form */}
</Dialog>
```

### 4. Loading States

Always show loading states for async operations:

```tsx
<Dialog
  loading={isLoading}
  actions={[
    {
      label: 'Save',
      onClick: handleSave,
      loading: isLoading
    }
  ]}
>
  {/* content */}
</Dialog>
```

### 5. Accessibility

- Always provide a `title`
- Add `description` for complex dialogs
- Use semantic HTML in content
- Test keyboard navigation
- Test with screen readers

---

## Styling

### Tailwind Classes

The Dialog respects your Tailwind configuration and uses existing design tokens:

- Colors: `primary-*`, `success-*`, `warning-*`, `error-*`
- Dark mode: Automatic with `dark:` classes
- Spacing: Standard Tailwind spacing scale

### Custom Styling

Use className props to customize:

```tsx
<Dialog
  className="custom-wrapper"
  contentClassName="custom-content"
  headerClassName="custom-header"
  bodyClassName="custom-body"
  footerClassName="custom-footer"
  overlayClassName="custom-overlay"
>
  {/* content */}
</Dialog>
```

---

## Performance

### Optimization Tips

1. **Portal Rendering** - Enabled by default, renders outside React tree
2. **AnimatePresence** - Handles exit animations efficiently
3. **Focus Trap** - Optimized with useCallback and memoization
4. **Body Scroll Lock** - Prevents unnecessary reflows

### Large Content

For dialogs with large content:

```tsx
<Dialog maxHeight="80vh">
  {/* Large scrollable content */}
</Dialog>
```

---

## Comparison with Old Modal

| Feature | Old Modal | New Dialog |
|---------|-----------|------------|
| Animation Library | CSS only | Framer Motion |
| Animation Types | 1 | 6 |
| Variants | None | 5 |
| Positions | Center only | 5 options |
| Focus Trap | No | Yes |
| ARIA | Partial | Complete |
| Nested Dialogs | No | Yes |
| Compound Components | No | Yes |
| TypeScript | Basic | Comprehensive |
| Loading States | No | Built-in |
| Actions API | No | Yes |

---

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Android)

---

## Troubleshooting

### Dialog doesn't close on Escape

Check `closeOnEscape` prop is `true` (default).

### Dialog doesn't trap focus

Ensure dialog has focusable elements. Add `tabIndex={0}` to make elements focusable.

### Animation issues

- Verify Framer Motion is installed (`framer-motion@^10.16.5`)
- Check AnimatePresence wraps the dialog correctly

### z-index conflicts

Use `stackOrder` prop to manually set z-index if needed.

### Content cut off

Set `maxHeight` prop or adjust dialog size.

---

## Migration from Old Modal

Replace imports:

```tsx
// Old
import Modal from '@/components/common/Modal'

// New
import { Dialog } from '@/components/common/Dialog'
```

Update props:

```tsx
// Old Modal
<Modal isOpen={isOpen} onClose={onClose} title="Title" size="lg">
  Content
</Modal>

// New Dialog (same props work!)
<Dialog isOpen={isOpen} onClose={onClose} title="Title" size="lg">
  Content
</Dialog>
```

The Dialog component is backward compatible with basic Modal props!

---

## Contributing

To add new features:

1. Update types in `DialogTypes.ts`
2. Implement in `Dialog.tsx`
3. Add tests
4. Update this README
5. Add examples to `DialogExamples.tsx`

---

## License

Part of the Capabble project.
