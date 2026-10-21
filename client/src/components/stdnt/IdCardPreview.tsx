import React from 'react'
import { QrCode } from 'lucide-react'
import { cx, initials } from '@/components/ui'
import type { IdCardDesign } from '@/services/idCardService'
import './id-cards.css'

export type IdCardSample = {
  name: string
  admissionNo: string
  classSection: string
  rollNo: string
  dob: string
  bloodGroup: string
  fatherName: string
  motherName: string
  guardianPhone: string
  address: string
  bus: string
  photoUrl?: string
}

type Props = {
  design: IdCardDesign
  school: { name: string; address?: string; logoUrl?: string; phone?: string }
  validity: string
  sample: IdCardSample
  /** Rendered over the front (the free-form canvas editor). */
  overlay?: React.ReactNode
}

/**
 * Screen copy of server/src/templates/id-card.html: same sizes in mm, so what is
 * placed on the canvas lands in the same spot on the printed card.
 */
const IdCardPreview: React.FC<Props> = ({ design, school, validity, sample, overlay }) => {
  const portrait = design.orientation === 'portrait'
  const f = design.fields
  const rows: Array<[string, string, boolean]> = [
    ['Adm. No.', sample.admissionNo, f.admissionNo],
    ['Date of birth', sample.dob, f.dob],
    ['Blood group', sample.bloodGroup, f.bloodGroup],
    ['Father', sample.fatherName, f.fatherName],
    ['Mother', sample.motherName, f.motherName],
    ['Phone', sample.guardianPhone, f.guardianPhone],
    ['Transport', sample.bus, f.bus],
  ]
  const style = { '--idc-accent': design.accentColor } as React.CSSProperties

  const photo = f.photo ? (
    sample.photoUrl ? <img className="idc-photo" src={sample.photoUrl} alt="" /> : <span className="idc-photo">{initials(sample.name)}</span>
  ) : null

  const details = (
    <>
      <div>
        <div className="idc-name">{sample.name.toUpperCase()}</div>
        {f.classSection ? <div className="idc-meta">Class {sample.classSection}{f.rollNo ? ` · Roll ${sample.rollNo}` : ''}</div> : null}
      </div>
      <table className="idc-rows">
        <tbody>
          {rows.filter(([, , on]) => on).map(([label, value]) => (
            <tr key={label}><td className="idc-label">{label}</td><td className="idc-value">{value}</td></tr>
          ))}
        </tbody>
      </table>
    </>
  )

  return (
    <div className="idc-previews" style={style}>
      <figure className="idc-figure">
        <div className={cx('idc-scale', portrait ? 'idc-scale--portrait' : 'idc-scale--landscape')}>
          <div className={cx('idc-card', portrait ? 'idc-card--portrait' : 'idc-card--landscape')}>
            <div className="idc-band">
              {design.showSchoolLogo && school.logoUrl ? <img src={school.logoUrl} alt="" /> : null}
              <div className="idc-school">
                <div className="idc-school__name">{school.name}</div>
                {design.showSchoolAddress && school.address ? <div className="idc-school__address">{school.address}</div> : null}
              </div>
            </div>
            <div className="idc-title">{design.title}</div>
            {portrait ? (
              <div className="idc-body idc-body--portrait">{photo}{details}</div>
            ) : (
              <div className="idc-body idc-body--landscape">
                {photo}
                <div className="idc-details">{details}</div>
              </div>
            )}
            <div className="idc-footer">
              {f.qr ? <span className="idc-qr" aria-label="QR code"><QrCode /></span> : <span />}
              {validity ? <div className="idc-validity">Valid for<br /><strong>{validity}</strong></div> : null}
              {design.signatures.principal ? (
                <div className="idc-sign">
                  {design.signatures.principalSignatureUrl ? <img src={design.signatures.principalSignatureUrl} alt="" /> : null}
                  <div className="idc-sign__line">Principal</div>
                </div>
              ) : null}
            </div>
            {overlay}
          </div>
        </div>
        <figcaption className="cb-subtle">Front</figcaption>
      </figure>

      {design.showBack ? (
        <figure className="idc-figure">
          <div className={cx('idc-scale', portrait ? 'idc-scale--portrait' : 'idc-scale--landscape')}>
            <div className={cx('idc-card idc-card--back', portrait ? 'idc-card--portrait' : 'idc-card--landscape')}>
              <div className="idc-band"><div className="idc-school"><div className="idc-school__name">{school.name}</div></div></div>
              <div className="idc-back">
                <div className="idc-back__heading">{sample.name}</div>
                {f.address && sample.address ? <div><strong>Address:</strong> {sample.address}</div> : null}
                <ul>
                  {design.backText.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => <li key={line}>{line}</li>)}
                </ul>
                <div className="idc-back__contact">
                  {design.emergencyContact || school.phone ? <div><strong>School:</strong> {design.emergencyContact || school.phone}</div> : null}
                  {f.guardianPhone ? <div><strong>Parent:</strong> {sample.guardianPhone}</div> : null}
                </div>
              </div>
            </div>
          </div>
          <figcaption className="cb-subtle">Back</figcaption>
        </figure>
      ) : null}
    </div>
  )
}

export default IdCardPreview
