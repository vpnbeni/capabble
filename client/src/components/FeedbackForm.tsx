import React, { useState } from 'react'
import { useCreateFeedbackMutation } from '@/hooks/useSupport'

type FeedbackFormProps = {
  onSubmitted?: () => void
  embedded?: boolean
}

const FeedbackForm: React.FC<FeedbackFormProps> = ({ onSubmitted, embedded = false }) => {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [rating, setRating] = useState<number | null>(5)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const submitFeedbackMutation = useCreateFeedbackMutation()
  const submitting = submitFeedbackMutation.isPending

  const validate = () => {
    const next: Record<string, string> = {}
    if (!name.trim()) next.name = 'Name is required'
    if (!email.trim()) {
      next.email = 'Email is required'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      next.email = 'Please enter a valid email'
    }
    if (!rating) next.rating = 'Please select a rating'
    if (!message.trim()) next.message = 'Please share your feedback'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    try {
      await submitFeedbackMutation.mutateAsync({
        name: name.trim(),
        email: email.trim(),
        rating: rating as number,
        message: message.trim(),
      })
      setName('')
      setEmail('')
      setRating(5)
      setMessage('')
      if (onSubmitted) onSubmitted()
    } catch {
      // API interceptor already shows message.
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={embedded ? 'space-y-3' : 'space-y-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm'}
    >
      {!embedded ? (
        <>
          <h2 className="text-sm font-semibold text-gray-900">Feedback</h2>
          <p className="text-xs text-gray-500">
            Help us improve Capabble by sharing your experience with any module or workflow.
          </p>
        </>
      ) : (
        <p className="text-xs text-gray-500">
          Help us improve Capabble by sharing your experience with any module or workflow.
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            title="Name"
            placeholder="Your name"
            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
          {errors.name && <p className="mt-1 text-[11px] text-red-500">{errors.name}</p>}
        </div>
        <div>
          <label className="block text-[11px] font-medium text-gray-600 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            title="Email"
            placeholder="you@example.com"
            className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
          {errors.email && <p className="mt-1 text-[11px] text-red-500">{errors.email}</p>}
        </div>
      </div>

      <div className="text-xs">
        <label className="block text-[11px] font-medium text-gray-600 mb-1">Rating</label>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              onClick={() => setRating(star)}
              className={`w-7 h-7 flex items-center justify-center rounded-full border text-sm ${
                rating && star <= rating
                  ? 'bg-yellow-400 border-yellow-400 text-white'
                  : 'bg-white border-gray-300 text-gray-400'
              }`}
            >
              ★
            </button>
          ))}
        </div>
        {errors.rating && <p className="mt-1 text-[11px] text-red-500">{errors.rating}</p>}
      </div>

      <div className="text-xs">
        <label className="block text-[11px] font-medium text-gray-600 mb-1">Message</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-y"
          placeholder="Share what is working well and what can be improved."
        />
        {errors.message && <p className="mt-1 text-[11px] text-red-500">{errors.message}</p>}
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Sending...' : 'Submit Feedback'}
        </button>
      </div>
    </form>
  )
}

export default FeedbackForm
