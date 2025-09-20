import { useState } from 'react'
import { DocumentArrowUpIcon, CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline'
import { watchlistsApi } from '../services/api'
import { UploadResponse } from '../types'

interface FilePreview {
  name: string
  size: number
  type: string
  headers?: string[]
  sampleData?: Record<string, any>[]
}

export default function Upload() {
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<FilePreview | null>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<UploadResponse | null>(null)
  const [error, setError] = useState<string>('')
  const [watchlistName, setWatchlistName] = useState('')
  const [description, setDescription] = useState('')

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (!selectedFile) return

    setFile(selectedFile)
    setError('')
    setResult(null)

    try {
      const text = await selectedFile.text()
      const lines = text.split('\n').filter(line => line.trim())
      
      if (lines.length === 0) {
        setError('File appears to be empty')
        return
      }

      const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
      const sampleData = lines.slice(1, 4).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''))
        const row: Record<string, any> = {}
        headers.forEach((header, index) => {
          row[header] = values[index] || ''
        })
        return row
      })

      setPreview({
        name: selectedFile.name,
        size: selectedFile.size,
        type: selectedFile.type || 'text/csv',
        headers,
        sampleData
      })

      if (!headers.includes('symbol')) {
        setError('CSV must contain a "symbol" column')
      }
    } catch (err) {
      setError('Error reading file. Please ensure it\'s a valid CSV.')
    }
  }

  const handleUpload = async () => {
    if (!file || !watchlistName.trim()) {
      setError('Please select a file and enter a watchlist name')
      return
    }

    setUploading(true)
    setError('')

    try {
      const response = await watchlistsApi.uploadFile(
        file,
        watchlistName.trim(),
        description.trim()
      )
      console.log('Upload response:', response)
      setResult(response)
      setFile(null)
      setPreview(null)
      setWatchlistName('')
      setDescription('')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const resetForm = () => {
    setFile(null)
    setPreview(null)
    setResult(null)
    setError('')
    setWatchlistName('')
    setDescription('')
  }

  return (
    <div className="px-4 py-6 sm:px-0">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Upload Watchlist</h1>
        <p className="mt-2 text-gray-600">
          Upload a CSV or Excel file to create a new watchlist
        </p>
      </div>

      <div className="max-w-3xl mx-auto">
        {result ? (
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center mb-4">
              <CheckCircleIcon className="h-8 w-8 text-green-500 mr-3" />
              <h2 className="text-xl font-semibold text-gray-900">Upload Successful!</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-green-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-green-700">{result.valid_symbols?.length || 0}</div>
                <div className="text-sm text-green-600">Valid Symbols</div>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-red-700">{result.invalid_symbols?.length || 0}</div>
                <div className="text-sm text-red-600">Invalid Symbols</div>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-blue-700">{result.total_processed || 0}</div>
                <div className="text-sm text-blue-600">Total Processed</div>
              </div>
            </div>

            <div className="mb-4">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Watchlist: {result.watchlist?.name || 'Unknown'}
              </h3>
              {result.watchlist?.description && (
                <p className="text-gray-600 mb-4">{result.watchlist.description}</p>
              )}
            </div>

            {result.invalid_symbols && result.invalid_symbols.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                <div className="flex items-center mb-2">
                  <ExclamationTriangleIcon className="h-5 w-5 text-yellow-500 mr-2" />
                  <h4 className="text-sm font-medium text-yellow-800">Invalid Symbols Found</h4>
                </div>
                <div className="text-sm text-yellow-700">
                  {result.invalid_symbols.join(', ')}
                </div>
              </div>
            )}

            <button
              onClick={resetForm}
              className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
            >
              Upload Another File
            </button>
          </div>
        ) : (
          <div className="bg-white shadow rounded-lg p-6">
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Watchlist Name *
                </label>
                <input
                  type="text"
                  value={watchlistName}
                  onChange={(e) => setWatchlistName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter watchlist name"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Optional description"
                />
              </div>

              {/* Column Requirements Section */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
                <div className="flex items-center mb-4">
                  <div className="bg-blue-100 p-2 rounded-lg mr-3">
                    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-semibold text-blue-900">CSV File Requirements</h3>
                </div>
                
                <div className="grid md:grid-cols-2 gap-6 mb-6">
                  <div className="bg-white rounded-lg p-5 border border-green-200 shadow-sm">
                    <div className="flex items-center mb-4">
                      <div className="bg-green-100 p-2 rounded-full mr-3">
                        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <h4 className="font-semibold text-green-800 text-base">Required Column</h4>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center">
                        <span className="bg-green-100 text-green-800 px-4 py-2 text-sm rounded-lg font-mono font-medium">symbol</span>
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed">Stock ticker symbol (e.g., AAPL, GOOGL)</p>
                    </div>
                  </div>
                  
                  <div className="bg-white rounded-lg p-5 border border-gray-200 shadow-sm">
                    <div className="flex items-center mb-4">
                      <div className="bg-gray-100 p-2 rounded-full mr-3">
                        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <h4 className="font-semibold text-gray-700 text-base">Optional Columns</h4>
                    </div>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                        <span className="bg-white text-gray-700 px-3 py-1.5 text-sm rounded-md font-mono border">entry_price</span>
                        <span className="text-sm text-gray-600">Purchase price</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                        <span className="bg-white text-gray-700 px-3 py-1.5 text-sm rounded-md font-mono border">target_price</span>
                        <span className="text-sm text-gray-600">Target sell price</span>
                      </div>
                      <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                        <span className="bg-white text-gray-700 px-3 py-1.5 text-sm rounded-md font-mono border">stop_loss</span>
                        <span className="text-sm text-gray-600">Stop loss price</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="bg-white rounded-lg p-4 border border-blue-200 mb-4">
                  <div className="flex items-center mb-2">
                    <div className="bg-blue-100 p-1.5 rounded-full mr-2">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h4 className="font-semibold text-blue-800">Example CSV Format:</h4>
                  </div>
                  <div className="bg-gray-50 rounded-md p-3 overflow-x-auto">
                    <pre className="text-sm font-mono text-gray-700 whitespace-pre">
symbol,entry_price,target_price,stop_loss
AAPL,150.00,180.00,130.00
GOOGL,125.50,150.00,110.00
MSFT,350.75,400.00,320.00</pre>
                  </div>
                </div>
                
                <div className="bg-blue-100 rounded-lg p-3">
                  <div className="flex items-start">
                    <div className="bg-blue-200 p-1 rounded-full mr-2 mt-0.5">
                      <svg className="w-3 h-3 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-blue-800">Note:</p>
                      <p className="text-sm text-blue-700">Company names, sectors, and industries will be automatically populated!</p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Upload File *
                </label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <DocumentArrowUpIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <div className="mt-4">
                    <label htmlFor="file-upload" className="cursor-pointer">
                      <span className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors">
                        Select File
                      </span>
                      <input
                        id="file-upload"
                        type="file"
                        accept=".csv,.xlsx,.xls"
                        onChange={handleFileSelect}
                        className="hidden"
                      />
                    </label>
                    <p className="mt-2 text-sm text-gray-500">
                      CSV or Excel files only. Must contain "symbol" column.
                    </p>
                  </div>
                </div>
              </div>

              {preview && (
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="text-lg font-medium text-gray-900 mb-4">File Preview</h3>
                  
                  <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
                    <div>
                      <span className="font-medium">Name:</span> {preview.name}
                    </div>
                    <div>
                      <span className="font-medium">Size:</span> {(preview.size / 1024).toFixed(1)} KB
                    </div>
                    <div>
                      <span className="font-medium">Type:</span> {preview.type}
                    </div>
                  </div>

                  {preview.headers && (
                    <div className="mb-4">
                      <h4 className="font-medium text-gray-900 mb-2">Columns Found:</h4>
                      <div className="flex flex-wrap gap-2">
                        {preview.headers.map((header, index) => (
                          <span
                            key={index}
                            className={`px-2 py-1 text-xs rounded ${
                              header.toLowerCase() === 'symbol'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {header}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {preview.sampleData && preview.sampleData.length > 0 && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Sample Data:</h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full border border-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              {preview.headers?.map((header, index) => (
                                <th key={index} className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase border-b">
                                  {header}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {preview.sampleData.slice(0, 3).map((row, rowIndex) => (
                              <tr key={rowIndex} className="border-b border-gray-200">
                                {preview.headers?.map((header, colIndex) => (
                                  <td key={colIndex} className="px-3 py-2 text-sm text-gray-900">
                                    {row[header] || '-'}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <div className="flex items-center">
                    <ExclamationTriangleIcon className="h-5 w-5 text-red-500 mr-2" />
                    <span className="text-red-700">{error}</span>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={handleUpload}
                  disabled={!file || !watchlistName.trim() || uploading || !!error}
                  className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                >
                  {uploading ? 'Uploading...' : 'Upload Watchlist'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}