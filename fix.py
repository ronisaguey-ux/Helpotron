with open('server/llm.py', 'r') as f:
    content = f.read()
content = content.replace('return {"status": "active"}', 'return {"status": "ok"}')
with open('server/llm.py', 'w') as f:
    f.write(content)
print('Successfully updated server/llm.py')
