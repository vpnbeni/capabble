import React from 'react'

type PlaceholderCard = {
  title: string
  description: string
}

type TimetablePagePlaceholderProps = {
  eyebrow: string
  title: string
  description: string
  cards: PlaceholderCard[]
}

const TimetablePagePlaceholder: React.FC<TimetablePagePlaceholderProps> = ({
  eyebrow,
  title,
  description,
  cards,
}) => {
  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm">
        <div className="bg-gradient-to-r from-sky-50 via-white to-emerald-50 px-6 py-6 sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-600">{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-gray-100 sm:text-3xl">{title}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">{description}</p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <article
            key={card.title}
            className="rounded-2xl border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 shadow-sm"
          >
            <h2 className="text-base font-semibold text-slate-900 dark:text-gray-100">{card.title}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{card.description}</p>
          </article>
        ))}
      </section>
    </div>
  )
}

export default TimetablePagePlaceholder
