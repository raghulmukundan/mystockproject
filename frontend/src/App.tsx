import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Upload from './pages/Upload'
import Chart from './pages/Chart'
import Alerts from './pages/Alerts'
import Universe from './pages/universe'
import HistoryImport from './pages/HistoryImport'
import PricesBrowser from './pages/PricesBrowser'
import JobStatus from './pages/JobStatus'
import Operations from './pages/Operations'
import OAuthCallback from './pages/OAuthCallback'

import Watchlists from './pages/Watchlists'
import WatchlistDetail from './pages/WatchlistDetail'
import { JobSettings } from './pages/JobSettings'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/watchlists" element={<Watchlists />} />
        <Route path="/watchlists/:id" element={<WatchlistDetail />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/chart/:symbol" element={<Chart />} />
        <Route path="/alerts" element={<Alerts />} />
        <Route path="/universe" element={<Universe />} />
        <Route path="/history-import" element={<HistoryImport />} />
        <Route path="/prices-browser" element={<PricesBrowser />} />
        <Route path="/job-settings" element={<JobSettings />} />
        <Route path="/job-status" element={<JobStatus />} />
        <Route path="/operations" element={<Operations />} />
        <Route path="/auth/callback" element={<OAuthCallback />} />
      </Routes>
    </Layout>
  )
}

export default App
