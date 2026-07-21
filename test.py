import os
import zipfile
import psycopg2
from minio import Minio

# Configurations
vps_ip = "169.58.42.163"
db_password = "MIIEpAIBAAKCAQEA8h81MkIA2AMlTd" # Put your POSTGRES_PASSWORD here
group_id = "3e6287e2-7013-4665-8f95-9ab7bbf03c49"
output_zip = r"C:\Users\madhu\Desktop\group_photos.zip"

print("Connecting to database...")
conn = psycopg2.connect(
    host=vps_ip,
    port=5432,
    dbname="photogenic",
    user="photogenic",
    password=db_password,
)

print("Connecting to MinIO...")
minio_client = Minio(
    f"{vps_ip}:9000",
    access_key="minioadmin",
    secret_key="MIIEpAIBAAKCAQEA8h81MkIA2AMlTd",  # Replace with MINIO_SECRET_KEY if customized
    secure=False,
)
bucket = "photogenic"

with conn:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT id, tenant_id, filename 
            FROM assets 
            WHERE group_id = %s AND status = 'ready'
        """, (group_id,))
        assets = cur.fetchall()

if not assets:
    print("No processed images found in this group.")
else:
    print(f"Downloading and packaging {len(assets)} images into {output_zip}...")
    with zipfile.ZipFile(output_zip, "w") as zip_file:
        for asset_id, tenant_id, filename in assets:
            object_key = f"{tenant_id}/{group_id}/originals/{asset_id}/{filename}"
            try:
                response = minio_client.get_object(bucket, object_key)
                zip_file.writestr(filename, response.read())
                response.close()
                response.release_conn()
                print(f"Downloaded and added: {filename}")
            except Exception as e:
                print(f"Failed to download {filename}: {e}")
    print("All images downloaded successfully to your Desktop!")
