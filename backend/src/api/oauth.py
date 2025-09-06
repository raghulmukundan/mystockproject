"""
OAuth endpoints for Schwab API integration
"""
import os
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import RedirectResponse, HTMLResponse
from pydantic import BaseModel
from dotenv import load_dotenv

from src.services.schwab.oauth import SchwabOAuthService

load_dotenv()

router = APIRouter()

# Request/Response models
class TokenInfo(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int
    scope: str
    token_obtained_at: int

class OAuthStatus(BaseModel):
    authenticated: bool
    expires_in: Optional[int] = None
    scope: Optional[str] = None
    client_id: str

class RefreshTokenRequest(BaseModel):
    refresh_token: str

# Initialize OAuth service
oauth_service = None

def get_oauth_service():
    global oauth_service
    if oauth_service is None:
        try:
            oauth_service = SchwabOAuthService()
        except ValueError as e:
            # OAuth not configured
            pass
    return oauth_service

@router.get("/auth/login")
async def login():
    """
    Initiate OAuth login flow.
    Redirects user to Schwab authorization page.
    """
    service = get_oauth_service()
    if not service:
        raise HTTPException(
            status_code=503, 
            detail="OAuth not configured. Please set Schwab API credentials."
        )
    
    try:
        # Generate state for CSRF protection
        import secrets
        state = secrets.token_urlsafe(32)
        
        # Store state in session/cache (simplified for demo)
        # In production, store in secure session or Redis
        
        auth_url = service.get_authorization_url(state=state)
        
        return RedirectResponse(url=auth_url, status_code=302)
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to initiate OAuth flow: {str(e)}")

@router.get("/auth/callback")
async def oauth_callback(
    code: Optional[str] = Query(None, description="Authorization code from Schwab"),
    state: Optional[str] = Query(None, description="State parameter for CSRF protection"),
    error: Optional[str] = Query(None, description="Error from OAuth provider")
):
    """
    Handle OAuth callback from Schwab.
    Exchanges authorization code for tokens.
    """
    service = get_oauth_service()
    if not service:
        raise HTTPException(
            status_code=503, 
            detail="OAuth not configured"
        )
    
    # Check for OAuth errors
    if error:
        error_description = Query(None)
        return HTMLResponse(
            content=f"""
            <html>
                <head><title>OAuth Error</title></head>
                <body>
                    <h1>Authorization Failed</h1>
                    <p><strong>Error:</strong> {error}</p>
                    <p><strong>Description:</strong> {error_description or 'No description provided'}</p>
                    <p><a href="/auth/login">Try Again</a></p>
                </body>
            </html>
            """,
            status_code=400
        )
    
    if not code:
        raise HTTPException(status_code=400, detail="Missing authorization code")
    
    # Validate state (in production, compare with stored state)
    # For now, we'll skip state validation for simplicity
    
    try:
        # Exchange code for tokens
        token_data = service.exchange_code_for_tokens(code)
        
        # Store tokens securely (in production, use encrypted storage)
        # For demo, we'll show the refresh token that needs to be added to .env
        refresh_token = token_data['refresh_token']
        
        return HTMLResponse(
            content=f"""
            <html>
                <head><title>OAuth Success</title></head>
                <body>
                    <h1>Authorization Successful!</h1>
                    <p>Your Schwab API access has been granted.</p>
                    <h2>Next Steps:</h2>
                    <ol>
                        <li>Copy the refresh token below</li>
                        <li>Update your .env file with: <code>SCHWAB_REFRESH_TOKEN={refresh_token}</code></li>
                        <li>Restart your application</li>
                    </ol>
                    <h3>Refresh Token:</h3>
                    <textarea rows="3" cols="80" readonly>{refresh_token}</textarea>
                    <br><br>
                    <p><strong>Note:</strong> Store this token securely. It allows API access to your Schwab account.</p>
                    <p><a href="/docs">Go to API Documentation</a></p>
                </body>
            </html>
            """,
            status_code=200
        )
        
    except Exception as e:
        return HTMLResponse(
            content=f"""
            <html>
                <head><title>Token Exchange Error</title></head>
                <body>
                    <h1>Token Exchange Failed</h1>
                    <p><strong>Error:</strong> {str(e)}</p>
                    <p><a href="/auth/login">Try Again</a></p>
                </body>
            </html>
            """,
            status_code=500
        )

@router.post("/auth/refresh", response_model=TokenInfo)
async def refresh_token(request: RefreshTokenRequest):
    """
    Refresh access token using refresh token.
    """
    service = get_oauth_service()
    if not service:
        raise HTTPException(
            status_code=503, 
            detail="OAuth not configured"
        )
    
    try:
        token_data = service.refresh_access_token(request.refresh_token)
        
        return TokenInfo(**token_data)
        
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Token refresh failed: {str(e)}")

@router.get("/auth/status", response_model=OAuthStatus)
async def oauth_status():
    """
    Check OAuth configuration and authentication status.
    """
    service = get_oauth_service()
    
    if not service:
        return OAuthStatus(
            authenticated=False,
            client_id="Not configured"
        )
    
    # Check if we have a refresh token configured
    refresh_token = os.getenv("SCHWAB_REFRESH_TOKEN", "")
    
    return OAuthStatus(
        authenticated=bool(refresh_token),
        client_id=service.client_id[:8] + "..." if service.client_id else "Not configured",
        scope="readonly"
    )

@router.post("/auth/revoke")
async def revoke_token(token: str, token_type: str = "refresh_token"):
    """
    Revoke access or refresh token.
    """
    service = get_oauth_service()
    if not service:
        raise HTTPException(
            status_code=503, 
            detail="OAuth not configured"
        )
    
    try:
        success = service.revoke_token(token, token_type)
        
        if success:
            return {"message": f"Token revoked successfully"}
        else:
            return {"message": "Token revocation completed (may have been already invalid)"}
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Token revocation failed: {str(e)}")

@router.get("/auth/logout")
async def logout():
    """
    Logout and provide instructions to clear tokens.
    """
    return HTMLResponse(
        content="""
        <html>
            <head><title>Logout</title></head>
            <body>
                <h1>Logout</h1>
                <p>To completely logout from Schwab API access:</p>
                <ol>
                    <li>Remove or clear the <code>SCHWAB_REFRESH_TOKEN</code> from your .env file</li>
                    <li>Restart your application</li>
                    <li>Optionally, revoke tokens via the <code>/auth/revoke</code> endpoint</li>
                </ol>
                <p><a href="/auth/status">Check OAuth Status</a></p>
            </body>
        </html>
        """,
        status_code=200
    )