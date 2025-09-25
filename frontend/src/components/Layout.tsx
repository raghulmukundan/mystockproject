import { Link, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import {
  ChartBarIcon,
  DocumentArrowUpIcon,
  ViewColumnsIcon,
  HomeIcon,
  BellIcon,
  CloudArrowDownIcon,
  MagnifyingGlassIcon,
  CogIcon,
  CheckCircleIcon,
  XCircleIcon,
  ArrowPathIcon,
  ClockIcon
} from '@heroicons/react/24/outline'
import clsx from 'clsx'
import AlertBadge from './AlertBadge'
import { isMarketOpen, getNextRefreshFromServer, getNextRefreshSlot, formatTimeUntil } from '../utils/marketTiming'

interface LayoutProps {
  children: React.ReactNode
}

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Watchlists', href: '/watchlists', icon: ViewColumnsIcon },
  { name: 'Alerts', href: '/alerts', icon: BellIcon },
  { name: 'Upload', href: '/upload', icon: DocumentArrowUpIcon },
  { name: 'Operations', href: '/operations', icon: CogIcon },
]

export default function Layout({ children }: LayoutProps) {
  const location = useLocation()
  const [nextRefresh, setNextRefresh] = useState<Date | null>(null)
  const [timeUntilRefresh, setTimeUntilRefresh] = useState('—')
  const [marketOpenStatus, setMarketOpenStatus] = useState(isMarketOpen())


  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      const next = await getNextRefreshFromServer()
      if (!cancelled) {
        setNextRefresh(next)
        setTimeUntilRefresh(formatTimeUntil(next))
      }
    }

    bootstrap()
    setMarketOpenStatus(isMarketOpen())

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    const tick = async () => {
      if (cancelled) return

      setMarketOpenStatus(isMarketOpen())

      if (!nextRefresh) return

      const now = new Date()
      if (nextRefresh.getTime() <= now.getTime()) {
        const next = await getNextRefreshFromServer()
        if (!cancelled) {
          setNextRefresh(next)
          setTimeUntilRefresh(formatTimeUntil(next))
        }
      } else {
        setTimeUntilRefresh(formatTimeUntil(nextRefresh, now))
      }
    }

    const interval = setInterval(() => {
      tick()
    }, 1000)

    tick()

    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [nextRefresh])

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <div className="flex-shrink-0 flex items-center">
                <ChartBarIcon className="h-8 w-8 text-blue-600" />
                <span className="ml-2 text-xl font-bold text-gray-900">
                  Stock Watchlist
                </span>
              </div>
              <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
                {navigation.map((item) => {
                  const isActive = location.pathname === item.href
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      className={clsx(
                        'inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium',
                        isActive
                          ? 'border-blue-500 text-gray-900'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      )}
                    >
                      <item.icon className="h-4 w-4 mr-2" />
                      {item.name}
                    </Link>
                  )
                })}
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Market Status */}
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2" title={`Market ${marketOpenStatus ? 'Open' : 'Closed'}`}>
                  <div className={`w-3 h-3 rounded-full ${marketOpenStatus ? 'bg-green-500' : 'bg-red-500'}`}></div>
                  <span className={`font-medium ${marketOpenStatus ? 'text-green-600' : 'text-red-600'}`}>
                    Market {marketOpenStatus ? 'Open' : 'Closed'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-gray-700" title={`Next refresh in ${timeUntilRefresh}`}>
                  <ClockIcon className="h-4 w-4 text-gray-500" />
                  <span className="font-medium">{timeUntilRefresh}</span>
                </div>
              </div>
              {/* Temporarily disabled AlertBadge due to fresh database */}
              {/* <AlertBadge /> */}
            </div>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  )
}
