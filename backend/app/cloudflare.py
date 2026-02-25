import os
import requests
from fastapi import HTTPException, UploadFile

# Cloudflare config
CLOUDFLARE_ACCOUNT_ID = os.getenv("CLOUDFLARE_ACCOUNT_ID")
CLOUDFLARE_API_TOKEN = os.getenv("CLOUDFLARE_API_TOKEN")
CLOUDFLARE_IMAGES_API_URL = f"https://api.cloudflare.com/client/v4/accounts/{CLOUDFLARE_ACCOUNT_ID}/images/v1"


def extract_image_id_from_url(url: str) -> str | None:
    """Extract image ID from Cloudflare image URL"""
    if not url:
        return None
    # Cloudflare URL format: https://imagedelivery.net/{account_hash}/{image_id}/avatar
    parts = url.split('/')
    if len(parts) >= 5 and 'imagedelivery.net' in url:
        return parts[4]
    return None


def delete_image_from_cloudflare(image_url: str) -> bool:
    """Delete an image from Cloudflare"""
    try:
        image_id = extract_image_id_from_url(image_url)
        if not image_id:
            return True  # No valid URL to delete
        
        headers = {
            "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}"
        }
        response = requests.delete(
            f"{CLOUDFLARE_IMAGES_API_URL}/{image_id}",
            headers=headers
        )
        return response.status_code == 200
    except Exception as e:
        print(f"Error deleting image from Cloudflare: {e}")
        return False


async def upload_image_to_cloudflare(file: UploadFile) -> str:
    """Upload an image to Cloudflare Images and return the image URL"""
    try:
        # Read file content
        content = await file.read()
        
        headers = {
            "Authorization": f"Bearer {CLOUDFLARE_API_TOKEN}"
        }
        
        files = {
            'file': (file.filename, content, file.content_type)
        }
        
        response = requests.post(
            CLOUDFLARE_IMAGES_API_URL,
            headers=headers,
            files=files
        )
        
        if response.status_code not in [200, 201]:
            raise Exception(f"Cloudflare upload failed: {response.text}")
        
        data = response.json()
        if data.get('success'):
            image_url = data['result']['variants'][0]  # Get the first variant URL
            return image_url
        else:
            raise Exception(f"Cloudflare API error: {data.get('errors')}")
    except Exception as e:
        print(f"Error uploading to Cloudflare: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to upload image: {str(e)}")
