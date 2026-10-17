# Tabs Component

A professional, accessible tabs component with multiple variants, keyboard navigation, and full TypeScript support.

## Features

- ✅ Multiple variants (pill, underline, enclosed)
- ✅ Full keyboard navigation (Arrow keys, Home/End, Enter/Space)
- ✅ Three size variants (sm, md, lg)
- ✅ Badge support for counts and notifications
- ✅ Custom icons support
- ✅ Color theming per tab
- ✅ Horizontal and vertical orientation
- ✅ Dark mode support
- ✅ Fully accessible (ARIA attributes, screen reader support)
- ✅ Disabled state for individual tabs
- ✅ TypeScript generics for type-safe tab IDs
- ✅ Smooth transitions and animations

## Installation

The component is already set up in your project. No additional dependencies required.

## Basic Usage

```tsx
import { Tabs } from '@/components/common/Tabs'

const MyComponent = () => {
  const [activeTab, setActiveTab] = useState('overview')

  return (
    <Tabs
      tabs={[
        { id: 'overview', label: 'Overview' },
        { id: 'details', label: 'Details' },
        { id: 'settings', label: 'Settings' }
      ]}
      activeTab={activeTab}
      onChange={setActiveTab}
    />
  )
}
```

## Props

### Core Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `tabs` | `TabConfig[]` | **required** | Array of tab configurations |
| `activeTab` | `string` | **required** | Currently active tab ID |
| `onChange` | `(tabId: string) => void` | **required** | Callback when tab changes |

### Appearance Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'pill' \| 'underline' \| 'enclosed'` | `'pill'` | Visual style variant |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Size of tabs |

### Layout Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Tab layout direction |
| `fullWidth` | `boolean` | `false` | Make tabs take full width |

### Styling Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `className` | `string` | `''` | Additional CSS class for container |
| `tabClassName` | `string` | - | Additional CSS class for each tab button |

### Accessibility Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `ariaLabel` | `string` | - | Accessible label for the tab list |
| `id` | `string` | - | HTML id for the container |

## TabConfig Interface

Each tab in the `tabs` array has the following structure:

```typescript
interface TabConfig {
  id: string              // Unique identifier
  label: string           // Display text
  icon?: ReactNode        // Optional icon (left side)
  badge?: string | number // Optional badge (right side)
  color?: TabColor        // Color theme
  disabled?: boolean      // Disable this tab
  ariaControls?: string   // ID of associated panel
}
```

### Available Colors

`blue` | `emerald` | `green` | `amber` | `yellow` | `rose` | `red` | `purple` | `gray` | `indigo` | `teal` | `orange`

## Variants

### Pill Variant (Default)

Modern rounded buttons in a container. Best for dashboards and metric views.

```tsx
<Tabs
  tabs={tabs}
  activeTab={activeTab}
  onChange={setActiveTab}
  variant="pill"
/>
```

### Underline Variant

Minimal design with bottom border indicator. Best for content sections.

```tsx
<Tabs
  tabs={tabs}
  activeTab={activeTab}
  onChange={setActiveTab}
  variant="underline"
/>
```

### Enclosed Variant

Traditional tab appearance with borders. Best for form sections.

```tsx
<Tabs
  tabs={tabs}
  activeTab={activeTab}
  onChange={setActiveTab}
  variant="enclosed"
/>
```

## Advanced Examples

### With Icons and Badges

```tsx
import { FileText, CheckCircle, Clock, Trash2 } from 'lucide-react'

<Tabs
  tabs={[
    {
      id: 'received',
      label: 'Received',
      icon: <FileText />,
      badge: 4260,
      color: 'blue'
    },
    {
      id: 'used',
      label: 'Used',
      icon: <CheckCircle />,
      badge: 0,
      color: 'emerald'
    },
    {
      id: 'balance',
      label: 'Balance',
      icon: <Clock />,
      badge: 4260,
      color: 'amber'
    },
    {
      id: 'discarded',
      label: 'Discarded',
      icon: <Trash2 />,
      badge: 0,
      color: 'rose'
    }
  ]}
  activeTab={activeTab}
  onChange={setActiveTab}
  variant="pill"
  size="md"
/>
```

### With Custom SVG Icons

```tsx
<Tabs
  tabs={[
    {
      id: 'overview',
      label: 'Overview',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    }
  ]}
  activeTab={activeTab}
  onChange={setActiveTab}
/>
```

### With Disabled Tabs

```tsx
<Tabs
  tabs={[
    { id: 'active', label: 'Active' },
    { id: 'pending', label: 'Pending', disabled: true },
    { id: 'archived', label: 'Archived' }
  ]}
  activeTab={activeTab}
  onChange={setActiveTab}
/>
```

### Vertical Orientation

```tsx
<Tabs
  tabs={tabs}
  activeTab={activeTab}
  onChange={setActiveTab}
  orientation="vertical"
/>
```

### With TypeScript Generics (Type-Safe Tab IDs)

```tsx
type MyTabIds = 'overview' | 'details' | 'settings'

const [activeTab, setActiveTab] = useState<MyTabIds>('overview')

<Tabs<MyTabIds>
  tabs={[
    { id: 'overview', label: 'Overview' },
    { id: 'details', label: 'Details' },
    { id: 'settings', label: 'Settings' }
  ]}
  activeTab={activeTab}
  onChange={setActiveTab}
/>
```

### With ARIA Controls (Linking to Tab Panels)

```tsx
<Tabs
  tabs={[
    { id: 'tab1', label: 'Tab 1', ariaControls: 'panel1' },
    { id: 'tab2', label: 'Tab 2', ariaControls: 'panel2' }
  ]}
  activeTab={activeTab}
  onChange={setActiveTab}
  ariaLabel="Main navigation tabs"
/>

<div id="panel1" role="tabpanel" aria-labelledby="tab1" hidden={activeTab !== 'tab1'}>
  Content for Tab 1
</div>
<div id="panel2" role="tabpanel" aria-labelledby="tab2" hidden={activeTab !== 'tab2'}>
  Content for Tab 2
</div>
```

## Keyboard Navigation

The Tabs component supports full keyboard navigation:

- **Arrow Right / Down**: Move to next tab (wraps to first)
- **Arrow Left / Up**: Move to previous tab (wraps to last)
- **Home**: Jump to first enabled tab
- **End**: Jump to last enabled tab
- **Enter / Space**: Activate focused tab
- **Tab**: Move focus in/out of tab list

Disabled tabs are automatically skipped during keyboard navigation.

## Accessibility

The component follows WAI-ARIA best practices for tabs:

- `role="tablist"` on the container
- `role="tab"` on each button
- `aria-selected="true|false"` for active/inactive state
- `aria-controls` linking tabs to panels
- `aria-disabled` for disabled tabs
- `aria-orientation` for horizontal/vertical layout
- `tabindex="0"` for active tab, `-1` for inactive tabs
- Keyboard navigation support
- Focus visible indicators
- Screen reader announcements

## Size Variants

### Small (`sm`)

Compact tabs for tight spaces:

```tsx
<Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} size="sm" />
```

### Medium (`md`) - Default

Standard size for most use cases:

```tsx
<Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} size="md" />
```

### Large (`lg`)

Larger tabs for prominent navigation:

```tsx
<Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} size="lg" />
```

## Color Themes

Each tab can have its own color theme:

```tsx
<Tabs
  tabs={[
    { id: 'success', label: 'Success', color: 'emerald' },
    { id: 'warning', label: 'Warning', color: 'amber' },
    { id: 'danger', label: 'Danger', color: 'rose' },
    { id: 'info', label: 'Info', color: 'blue' }
  ]}
  activeTab={activeTab}
  onChange={setActiveTab}
/>
```

## Responsive Design

The Tabs component is responsive by default:

- Touch-friendly tap targets
- Horizontal scrolling on mobile (for many tabs)
- Proper spacing and padding

For mobile optimization with many tabs, consider:

```tsx
<div className="overflow-x-auto">
  <Tabs
    tabs={manyTabs}
    activeTab={activeTab}
    onChange={setActiveTab}
  />
</div>
```

## Dark Mode

The component automatically adapts to dark mode using Tailwind's `dark:` classes. No additional configuration needed.

## Custom Styling

### Container Styling

```tsx
<Tabs
  tabs={tabs}
  activeTab={activeTab}
  onChange={setActiveTab}
  className="shadow-lg rounded-2xl"
/>
```

### Individual Tab Styling

```tsx
<Tabs
  tabs={tabs}
  activeTab={activeTab}
  onChange={setActiveTab}
  tabClassName="font-bold uppercase"
/>
```

## Performance

The Tabs component is highly performant:

- Minimal re-renders using React.memo internally
- Efficient keyboard navigation with ref management
- No unnecessary DOM manipulations
- Lightweight bundle size

## Migration from Inline Tabs

If you have inline tabs like this:

```tsx
// Before
<nav className="flex gap-1 p-1 bg-gray-100 rounded-xl">
  <button
    onClick={() => setActiveTab('tab1')}
    className={activeTab === 'tab1' ? 'bg-blue-500 text-white' : 'text-gray-600'}
  >
    Tab 1
  </button>
  <button
    onClick={() => setActiveTab('tab2')}
    className={activeTab === 'tab2' ? 'bg-blue-500 text-white' : 'text-gray-600'}
  >
    Tab 2
  </button>
</nav>
```

Replace with:

```tsx
// After
<Tabs
  tabs={[
    { id: 'tab1', label: 'Tab 1' },
    { id: 'tab2', label: 'Tab 2' }
  ]}
  activeTab={activeTab}
  onChange={setActiveTab}
/>
```

## TypeScript

The component is fully typed with generics support:

```typescript
import { Tabs, TabConfig, TabsProps } from '@/components/common/Tabs'

type MyTabId = 'tab1' | 'tab2' | 'tab3'

const tabs: TabConfig<MyTabId>[] = [
  { id: 'tab1', label: 'Tab 1' },
  { id: 'tab2', label: 'Tab 2' },
  { id: 'tab3', label: 'Tab 3' }
]

const MyComponent = () => {
  const [activeTab, setActiveTab] = useState<MyTabId>('tab1')
  
  return (
    <Tabs<MyTabId>
      tabs={tabs}
      activeTab={activeTab}
      onChange={setActiveTab}
    />
  )
}
```

## Browser Support

Works in all modern browsers:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers

## Best Practices

1. **Use descriptive tab labels** - Keep them short but clear
2. **Limit number of tabs** - 5-7 tabs maximum for horizontal layouts
3. **Use badges sparingly** - Only for important counts/notifications
4. **Match colors to meaning** - Use consistent color schemes (e.g., green for success)
5. **Provide aria-controls** - Link tabs to their panels for better accessibility
6. **Don't nest tabs** - Avoid tabs within tabs (use different navigation patterns)
7. **Consider vertical tabs** - For sidebars or when you have many tabs

## Troubleshooting

### Tabs not responding to clicks

Ensure `onChange` callback is provided and updates the `activeTab` state:

```tsx
const [activeTab, setActiveTab] = useState('tab1')

<Tabs
  tabs={tabs}
  activeTab={activeTab}
  onChange={setActiveTab} // Must update activeTab
/>
```

### TypeScript errors with tab IDs

Use generic type parameter:

```tsx
type TabIds = 'tab1' | 'tab2'
<Tabs<TabIds> ... />
```

### Styles not applying

Ensure Tailwind CSS is configured to scan the Tabs component directory:

```js
// tailwind.config.js
content: [
  './src/components/common/Tabs/**/*.{ts,tsx}',
  // ... other paths
]
```

## Examples in the Codebase

See these files for real-world usage:

- `client/src/pages/AnswerSheets.tsx` - Pill variant with icons and badges
- `client/src/pages/DateSheets.tsx` - Underline variant
- `client/src/pages/CentreGuidelines.tsx` - Multiple tab configurations

## License

Part of the Capabble project.
