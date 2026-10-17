"""Validate shipped HTML entry points and their local scripts/styles/images."""
from html.parser import HTMLParser
from pathlib import Path
import subprocess
from urllib.parse import unquote, urlsplit

ROOT = Path.cwd().resolve()


class Page(HTMLParser):
    def __init__(self, path):
        super().__init__(convert_charrefs=True)
        self.path = path
        self.inline = None
        self.references = 0

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        value = attrs.get('src') if tag in ('script', 'img') else (
            attrs.get('href') if tag == 'link' and attrs.get('rel') == 'stylesheet' else None)
        if value:
            url = urlsplit(value)
            if not url.scheme and not url.netloc:
                target = (ROOT / unquote(url.path).lstrip('/') if url.path.startswith('/')
                          else self.path.parent / unquote(url.path)).resolve()
                assert target.is_relative_to(ROOT) and target.is_file(), f'{self.path.name}: missing local asset {value}'
                self.references += 1
        if tag == 'script' and not attrs.get('src') and attrs.get('type', '') in ('', 'text/javascript'):
            self.inline = []

    def handle_data(self, data):
        if self.inline is not None:
            self.inline.append(data)

    def handle_endtag(self, tag):
        if tag == 'script' and self.inline is not None:
            result = subprocess.run(['node', '--check'], input=''.join(self.inline), text=True, encoding='utf-8')
            assert result.returncode == 0, f'{self.path.name}: inline JavaScript syntax failed'
            self.inline = None


pages = sorted(ROOT.glob('*.html'))
assert pages, 'No HTML entry points'
references = 0
for path in pages:
    page = Page(path)
    page.feed(path.read_text(encoding='utf-8'))
    page.close()
    references += page.references
assert references > 0, 'No local assets checked'
scripts = subprocess.check_output(['git', 'ls-files', '-z', '--', '*.js'], text=True).split('\0')
for script in filter(None, scripts):
    subprocess.run(['node', '--check', script], check=True)
print(f'PASS: {len(pages)} HTML entry points, {references} local assets, and JavaScript syntax')
