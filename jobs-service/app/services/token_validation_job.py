"""
Schwab token validation job
"""
import logging
import httpx
from app.services.job_status import begin_job, complete_job, fail_job, prune_history

logger = logging.getLogger(__name__)

def validate_schwab_token_job():
    """
    Validate Schwab token status to monitor credential health.

    This job:
    1. Checks token status from external-apis service
    2. Logs token health information
    3. Provides early warning for token expiration issues
    4. Helps prevent EOD scan failures due to invalid credentials
    """
    job_name = "schwab_token_validation"
    job_id = None

    try:
        logger.info("Starting Schwab token validation job")
        job_id = begin_job(job_name)

        # Check token status from external-apis service
        logger.info("Checking Schwab token status...")

        try:
            with httpx.Client(timeout=10.0) as client:
                response = client.get("http://external-apis:8003/schwab/token/status")

                if response.status_code != 200:
                    raise Exception(f"Token status endpoint returned HTTP {response.status_code}")

                token_status = response.json()
                logger.info(f"Token status response: {token_status}")

                # Analyze token status
                credentials_available = token_status.get('credentials_available', False)
                is_valid = token_status.get('valid', False)
                is_stale = token_status.get('stale', True)
                expires_in = token_status.get('expires_in')
                age_seconds = token_status.get('age_seconds')
                message = token_status.get('message', '')

                if not credentials_available:
                    warning_msg = "⚠️  Schwab credentials not configured (missing CLIENT_ID, CLIENT_SECRET, or REFRESH_TOKEN)"
                    logger.warning(warning_msg)

                elif is_stale and not is_valid:
                    info_msg = f"ℹ️  Schwab token is stale but will refresh automatically on next API call. {message}"
                    logger.info(info_msg)

                elif is_valid:
                    success_msg = f"✅ Schwab token is valid and fresh"
                    if expires_in is not None:
                        success_msg += f" (expires in {expires_in // 60} minutes)"
                    if age_seconds is not None:
                        success_msg += f" (obtained {age_seconds // 60} minutes ago)"
                    logger.info(success_msg)

                else:
                    info_msg = f"ℹ️  Schwab token status: {message}"
                    logger.info(info_msg)

                # Check for token expiration warnings (if expires within 2 hours)
                if credentials_available and expires_in is not None and expires_in < 7200:  # 2 hours
                    if expires_in <= 0:
                        logger.warning("⚠️  Schwab token has expired and needs refresh")
                    else:
                        logger.warning(f"⚠️  Schwab token expires soon (in {expires_in // 60} minutes)")

                # Check for refresh token expiration warnings (if older than 6 days)
                # Schwab refresh tokens typically expire after 7 days
                if credentials_available and age_seconds is not None and age_seconds > (6 * 24 * 3600):  # 6 days
                    days_old = age_seconds // (24 * 3600)
                    logger.warning(f"⚠️  Schwab refresh token is {days_old} days old. Refresh tokens typically expire after 7 days.")

                # Job completed successfully
                complete_job(job_id, records_processed=1)  # 1 token status checked
                prune_history(job_name, keep=10)  # Keep more history for token validation

                logger.info("Schwab token validation completed successfully")

        except httpx.RequestError as e:
            error_msg = f"Failed to connect to external-apis service: {e}"
            logger.error(error_msg)
            raise Exception(error_msg)

    except Exception as e:
        error_msg = f"Schwab token validation failed: {str(e)}"
        logger.error(error_msg)
        if job_id is not None:
            fail_job(job_id, error_msg)
            prune_history(job_name, keep=10)
        raise