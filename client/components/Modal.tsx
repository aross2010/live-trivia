'use client'
import React, { useEffect, useState } from 'react'

type Props = {
  open: boolean
  onClose: () => void
  children?: React.ReactNode
  className?: string
}

export default function Modal({ open, onClose, children, className }: Props) {
  const [mounted, setMounted] = useState(open)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      requestAnimationFrame(() => setVisible(true))
    } else if (mounted) {
      setVisible(false)
      const t = setTimeout(() => setMounted(false), 220)
      return () => clearTimeout(t)
    }
  }, [open, mounted])

  useEffect(() => {
    if (!mounted) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mounted, onClose])

  if (!mounted) return null

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-opacity ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      <div
        className="absolute inset-0 bg-black/75"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className={`relative p-6 rounded-sm w-full max-w-150 transform transition-all ${visible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95'} ${className ?? ''}`}
        style={{
          background: 'linear-gradient(135deg, rgba(13,23,48,0.98), rgba(5,8,19,0.98))',
          border: '1px solid rgba(0,191,255,0.18)',
          boxShadow: '0 0 60px rgba(0,191,255,0.08), 0 20px 60px rgba(0,0,0,0.8)',
        }}
      >
        {children}
      </div>
    </div>
  )
}
