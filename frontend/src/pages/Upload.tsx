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
                <div className="text-2xl font-bold text-green-700">{result.valid_symbols.length}</div>
                <div className="text-sm text-green-600">Valid Symbols</div>
              </div>
              <div className="bg-red-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-red-700">{result.invalid_symbols.length}</div>
                <div className="text-sm text-red-600">Invalid Symbols</div>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="text-2xl font-bold text-blue-700">{result.total_processed}</div>
                <div className="text-sm text-blue-600">Total Processed</div>
              </div>
            </div>

            <div className="mb-4">
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                Watchlist: {result.watchlist.name}
              </h3>
              {result.watchlist.description && (
                <p className="text-gray-600 mb-4">{result.watchlist.description}</p>
              )}
            </div>

            {result.invalid_symbols.length > 0 && (
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