import json, subprocess, sys
from pathlib import Path

REPO_ROOT = Path('/home/roni/Roni_workspace/helpotron')
PLAN_PATH = Path('/home/roni/Roni_workspace/audits_plans/helpotron_remediation_execution_plan_step_by_step_8_19.json')

def load_plan():
    with open(PLAN_PATH, 'r') as f:
        return json.load(f)

def replace_range(file_path: Path, start: int, end: int, new_content: str):
    """Replace lines start‑end (1‑based inclusive) in file_path with new_content.
    new_content may contain literal '\n' characters; they are split into lines.
    """
    text = file_path.read_text(encoding='utf-8')
    lines = text.splitlines()
    if start < 1 or end > len(lines):
        raise ValueError(f'Range {start}-{end} out of bounds for {file_path}')
    new_lines = new_content.split('\n')
    new_file_lines = lines[:start-1] + new_lines + lines[end:]
    file_path.write_text('\n'.join(new_file_lines) + '\n', encoding='utf-8')

def run_git_cmd(args, cwd=REPO_ROOT):
    result = subprocess.run(['git'] + args, cwd=str(cwd), capture_output=True, text=True)
    if result.returncode != 0:
        print('Git command failed:', ' '.join(args))
        print(result.stderr)
        sys.exit(1)
    return result.stdout.strip()

def commit_file(file_path: Path, step_id: str, title: str):
    rel_path = file_path.relative_to(REPO_ROOT)
    run_git_cmd(['add', str(rel_path)])
    msg = f"fix(remediation): {step_id} – {title}"
    run_git_cmd(['commit', '-m', msg])
    print(f'Committed {rel_path} with message: {msg}')

def verify_commands(commands):
    for cmd in commands:
        print('Running verification command:', cmd['command'])
        result = subprocess.run(cmd['command'], shell=True, cwd=str(REPO_ROOT), capture_output=True, text=True)
        out = result.stdout.strip()
        err = result.stderr.strip()
        if result.returncode != 0:
            print('Verification failed:', cmd['description'])
            print('stderr:', err)
            sys.exit(1)
        expected = cmd.get('expected_output')
        if expected and expected not in out:
            print('Verification output mismatch for', cmd['description'])
            print('Expected substring:', expected)
            print('Got:', out)
            sys.exit(1)
        print('Verification passed:', cmd['description'])

def apply_plan():
    plan = load_plan()
    for phase in plan.get('phases', []):
        print('=== Phase', phase.get('phase_number'), '-', phase.get('phase_name'), '===')
        for step in phase.get('steps', []):
            step_id = step.get('step_id')
            title = step.get('title')
            print(f'-- Applying {step_id}: {title}')
            for target in step.get('target_files', []):
                if target.get('action') != 'EDIT':
                    continue
                start, end = map(int, target['line_numbers'].split('-'))
                after = target['after_code_snippet']
                file_path = REPO_ROOT / target['file_path']
                replace_range(file_path, start, end, after)
                commit_file(file_path, step_id, title)
            verify_commands(step.get('verification_commands', []))
    print('Pushing all commits to origin/main')
    run_git_cmd(['push', 'origin', 'main'])
    print('Push complete')

if __name__ == '__main__':
    apply_plan()
