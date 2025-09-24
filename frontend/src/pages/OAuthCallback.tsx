import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

const OAuthCallback: React.FC = () => {
  const [searchParams] = useSearchParams()
  const [result, setResult] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const code = searchParams.get('code')
        const error = searchParams.get('error')

        if (error) {
          setResult(`❌ OAuth Error: ${error}`)
          setLoading(false)
          return
        }

        if (!code) {
          setResult('❌ No authorization code received')
          setLoading(false)
          return
        }

        console.log('🔍 DEBUG: Authorization code received:', code)
        console.log('🔍 DEBUG: Full search params:', Object.fromEntries(searchParams.entries()))
        setResult(`📋 Authorization code received: ${code}`)
        setLoading(false)

        // Exchange the code for tokens using your external-apis service
        const response = await fetch(`http://localhost:8003/schwab/oauth/callback?code=${encodeURIComponent(code)}`, {
          method: 'GET'
        })

        if (response.ok) {
          const responseText = await response.text()
          if (responseText.includes('refresh token')) {
            setResult(`✅ Success! Token exchange completed. Check the response for your new refresh token.`)
          } else {
            setResult(`✅ OAuth callback processed successfully`)
          }
        } else {
          const errorData = await response.text()
          setResult(`❌ Error: ${errorData}`)
        }
      } catch (error) {
        setResult(`❌ Error: ${error}`)
        setLoading(false)
      }
    }

    handleCallback()
  }, [searchParams])

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', margin: '40px' }}>
      <h1>Schwab OAuth Callback</h1>

      {loading ? (
        <p>Processing OAuth callback...</p>
      ) : (
        <>
          <div style={{
            background: result.startsWith('✅') ? '#e7f3ff' : '#ffe7e7',
            padding: '20px',
            borderRadius: '5px',
            marginBottom: '20px',
            wordBreak: 'break-all'
          }}>
            {result}
          </div>

          <div style={{ background: '#f5f5f5', padding: '15px', borderRadius: '5px', marginBottom: '20px', fontSize: '12px' }}>
            <h4>Debug Information:</h4>
            <p><strong>Authorization Code:</strong> {searchParams.get('code') || 'None'}</p>
            <p><strong>State:</strong> {searchParams.get('state') || 'None'}</p>
            <p><strong>Error:</strong> {searchParams.get('error') || 'None'}</p>
            <p><strong>All URL Params:</strong> {JSON.stringify(Object.fromEntries(searchParams.entries()), null, 2)}</p>
          </div>

          {result.startsWith('✅') && (
            <div style={{ background: '#e7f3ff', padding: '15px', borderRadius: '5px' }}>
              <h3>Next Steps:</h3>
              <ol>
                <li>Copy the refresh token above</li>
                <li>Update your .env file: <code>SCHWAB_REFRESH_TOKEN=your_new_token</code></li>
                <li>Restart the external-apis service: <code>docker-compose restart external-apis</code></li>
              </ol>
              <p><strong>⚠️ Remember:</strong> Schwab refresh tokens expire after 7 days.</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default OAuthCallback