Dependencies needed to run this locally:

1) uvicorn
2) sqlalchemy
3) fastapi
4) python 
5) email-validator: pip install pydantic[email]
6) jose: pip install python-jose[cryptography] (NOT jose - that's different)
7) passlib: pip install passlib
8) apscheduler

2) if using windows, modify run_local_sqlite.sh to use "python" instead of "python3" in the command