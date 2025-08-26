import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Upload from './pages/Upload'
import Chart from './pages/Chart'
import Alerts from './pages/Alerts'

import Watchlists from './pages/Watchlists'
import WatchlistDetail from './pages/WatchlistDetail'

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
      </Routes>
    </Layout>
  )
}

export default App