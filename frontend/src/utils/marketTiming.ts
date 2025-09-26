import { jobsApiService } from '../services/jobsApi'

const MARKET_TIMEZONE = 'America/Chicago'
const MARKET_OPEN_MINUTES = 8 * 60 + 30 // 8:30 AM CST
const MARKET_CLOSE_MINUTES = 15 * 60 // 3:00 PM CST

const toMarketTime = (date: Date) => new Date(date.toLocaleString('en-US', { timeZone: MARKET_TIMEZONE }))

const isWeekend = (date: Date) => {
  const day = date.getDay()
  return day === 0 || day === 6
}

export const isMarketOpen = (referenceDate = new Date()): boolean => {
  const cstTime = toMarketTime(referenceDate)
  if (isWeekend(cstTime)) return false

  const minutes = cstTime.getHours() * 60 + cstTime.getMinutes()
  return minutes >= MARKET_OPEN_MINUTES && minutes < MARKET_CLOSE_MINUTES
}

export const getNextMarketOpen = (referenceDate = new Date()): Date => {
  const cstTime = toMarketTime(referenceDate)
  const nextOpen = new Date(cstTime)
  nextOpen.setHours(8, 30, 0, 0)

  if (
    isWeekend(cstTime) ||
    cstTime.getHours() > 8 ||
    (cstTime.getHours() === 8 && cstTime.getMinutes() >= 30)
  ) {
    nextOpen.setDate(nextOpen.getDate() + 1)
  }

  while (isWeekend(nextOpen)) {
    nextOpen.setDate(nextOpen.getDate() + 1)
  }

  return nextOpen
}

export const getNextRefreshSlot = (
  referenceDate = new Date(),
  intervalMinutes = 30
): Date => {
  const now = new Date(referenceDate)

  if (!isMarketOpen(now)) {
    return getNextMarketOpen(now)
  }

  const next = new Date(now)
  const currentMinutes = next.getMinutes()
  const nextSlot = Math.ceil(currentMinutes / intervalMinutes) * intervalMinutes
  next.setMinutes(nextSlot, 0, 0)

  const cstNext = toMarketTime(next)
  const minutes = cstNext.getHours() * 60 + cstNext.getMinutes()
  if (minutes >= MARKET_CLOSE_MINUTES) {
    return getNextMarketOpen(now)
  }

  return next
}

export const getNextRefreshFromServer = async () => {
  try {
    const data = await jobsApiService.getNextMarketRefresh()
    if (data?.next_run_at) {
      return new Date(data.next_run_at)
    }
  } catch (error) {
    console.warn('Failed to retrieve next refresh from server, using local estimate.', error)
  }

  return getNextRefreshSlot()
}

export const formatTimeUntil = (target: Date, reference = new Date()) => {
  const diff = target.getTime() - reference.getTime()
  if (diff <= 0) return 'soon'

  const totalSeconds = Math.floor(diff / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }

  if (minutes > 0) {
    return `${minutes}m ${seconds}s`
  }

  return `${seconds}s`
}
