import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter, Link } from 'react-router-dom'
import './styles/globals.css'
import './styles/capabble/tokens.css'
import './styles/capabble/components.css'
import './styles/capabble/app.css'
import './styles/capabble/shell.css'
import { Badge, Card, ColumnChart } from '@/components/ui'

const list = (
  <>
    <p className="cb-hovercard__title">4th · 3 absent, 1 half day</p>
    <ul className="cb-hovercard__list">
      {[['Aarav Sharma', 'A', '12', false], ['Diya Verma', 'A', '18', false], ['Kabir Singh', 'B', '4', false], ['Meera Jain', 'B', '9', true]].map(([n, s, r, h]) => (
        <li key={String(n)}><Link className="cb-hovercard__row" to="/stdnt/students/1"><span className="cb-hovercard__row-main"><strong>{n}</strong><span>Section {s} · Roll {r}</span></span>{h ? <Badge tone="warning">Half day</Badge> : null}</Link></li>
      ))}
    </ul>
    <div className="cb-hovercard__footer"><Link to="/attnd/student-attendance?class=4th" className="cb-link">Open 4th register →</Link></div>
  </>
)
createRoot(document.getElementById('root')!).render(
  <HashRouter>
    <div className="cb-app" style={{ padding: 24, background: 'var(--bg)', minHeight: '100vh' }}>
      <Card title="By class">
        <ColumnChart label="test" target={{ value: 95, label: '95%' }} items={[
          { label: '4th', value: 96.5, caption: '4 absent', detail: list, detailLabel: '4th absent' },
          ...['5th', '6th', '7th', '8th'].map((l) => ({ label: l, value: 100 })),
        ]} />
      </Card>
    </div>
  </HashRouter>
)
