// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useProgress } from '@react-three/drei'
import LoadingScreen from './LoadingScreen'
import { LOADING_FADE_MS, loadingCopy, useLoading } from './loading'

// drei's useProgress is a zustand store over three's loading manager; a plain store stands in.
vi.mock('@react-three/drei', async () => {
  const { create } = await import('zustand')
  return { useProgress: create(() => ({ loaded: 0, total: 0, active: false, progress: 0, item: '', errors: [] })) }
})

const progress = useProgress as unknown as { setState: (s: { loaded: number; total: number }) => void }

beforeEach(() => {
  useLoading.setState({ shown: false, gone: false })
  progress.setState({ loaded: 0, total: 0 })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('loadingCopy', () => {
  it('opens before anything is queued, then counts the loads, then sets up the floor', () => {
    expect(loadingCopy(0, 0, false)).toEqual({ step: 'Opening the office', pct: 0 })
    expect(loadingCopy(42.7, 12, false)).toEqual({ step: 'Bringing in the furniture and the team', pct: 42 })
    expect(loadingCopy(100, 12, false)).toEqual({ step: 'Setting up the floor', pct: 100 })
    expect(loadingCopy(10, 12, true)).toEqual({ step: 'Welcome in', pct: 100 })
  })
})

describe('LoadingScreen', () => {
  it('replaces the blank screen with the name, a progress bar and the step', () => {
    render(<LoadingScreen />)
    expect(screen.getByText('Virtual Office')).toBeTruthy()
    expect(screen.getByText('Opening the office')).toBeTruthy()
    expect(screen.getByRole('progressbar', { name: 'Loading the office' }).getAttribute('aria-valuenow')).toBe('0')
  })

  it('shows real progress and never moves backwards when more loads join', () => {
    render(<LoadingScreen />)
    act(() => progress.setState({ loaded: 6, total: 12 }))
    expect(screen.getByText('50%')).toBeTruthy()
    act(() => progress.setState({ loaded: 6, total: 20 }))
    expect(screen.getByText('50%')).toBeTruthy()
  })

  it('fades out once the floor has rendered, then unmounts and says so', () => {
    vi.useFakeTimers()
    render(<LoadingScreen />)
    act(() => useLoading.setState({ shown: true }))
    expect(screen.getByTestId('office-loading').className).toContain('leaving')
    expect(useLoading.getState().gone).toBe(false)
    act(() => vi.advanceTimersByTime(LOADING_FADE_MS))
    expect(screen.queryByTestId('office-loading')).toBeNull()
    expect(useLoading.getState().gone).toBe(true)
  })
})
