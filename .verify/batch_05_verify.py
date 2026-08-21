import subprocess

def test_nginx():
    content = open('deploy/nginx.conf').read()
    assert 'TLSv1.3' in content
    assert 'Strict-Transport-Security' in content
    print('Nginx verify OK')

def test_service():
    content = open('deploy/helpotron-api.service').read()
    assert '127.0.0.1' in content
    print('Service verify OK')

def test_backup():
    res = subprocess.run(['bash', '-n', 'scripts/backup_db.sh'], capture_output=True)
    assert res.returncode == 0
    print('Backup verify OK')

if __name__ == '__main__':
    test_nginx()
    test_service()
    test_backup()
    print('All batch 05 checks passed')
