import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import Watchlists from './pages/Watchlists'
import Upload from './pages/Upload'
import Chart from './pages/Chart'

function App() {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/watchlists" element={<Watchlists />} />
        <Route path="/upload" element={<Upload />} />
        <Route path="/chart/:symbol" element={<Chart />} />
      </Routes>
    </Layout>
  )
}

export default App