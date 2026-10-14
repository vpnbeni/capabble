import React from 'react'
import { Button, Card, FilterBar, Select } from '@/components/ui'
import { CandidateStats } from '../../types/candidate'

interface Filters {
  search: string
  status: string
}

interface CandidateFiltersProps {
  filters: Filters
  onFilterChange: (filters: Filters) => void
  stats: CandidateStats | null
}

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'graduated', label: 'Graduated' },
  { value: 'suspended', label: 'Suspended' },
]

/** Search and status filter for a candidate list. Renders inside a `.cb-app` page. */
const CandidateFilters: React.FC<CandidateFiltersProps> = ({ filters, onFilterChange, stats: _stats }) => {
  const handleInputChange = (key: keyof Filters, value: string) => {
    onFilterChange({
      ...filters,
      [key]: value,
    })
  }

  const clearFilters = () => {
    onFilterChange({
      search: '',
      status: '',
    })
  }

  const hasActiveFilters = Object.values(filters).some((value) => value !== '')

  return (
    <Card>
      <FilterBar
        search={{
          placeholder: 'Search by name or roll number',
          value: filters.search,
          onChange: (value) => handleInputChange('search', value),
          label: 'Search candidates',
        }}
        filters={
          <Select
            size="sm"
            aria-label="Status"
            placeholder="All statuses"
            value={filters.status}
            onChange={(e) => handleInputChange('status', e.target.value)}
            options={STATUS_OPTIONS}
          />
        }
        actions={
          hasActiveFilters ? (
            <Button size="sm" variant="tertiary" onClick={clearFilters}>
              Clear filters
            </Button>
          ) : null
        }
      />
    </Card>
  )
}

export default CandidateFilters
