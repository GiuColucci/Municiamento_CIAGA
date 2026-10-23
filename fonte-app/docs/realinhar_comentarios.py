"""Realinha os números de linha de comentarios.py depois de uma mudança no código.

    python docs/realinhar_comentarios.py

Compara cada arquivo comentado com a versão do último commit (git HEAD; só funciona dentro de um repositório Git) e leva cada trecho para as novas
linhas. Linhas novas no meio de um trecho ficam nele; linhas novas entre trechos entram no trecho anterior.
Depois, confira e ajuste o texto das explicações que mudaram de sentido.
"""
import difflib
import re
import subprocess
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
P = RAIZ / "docs" / "comentarios.py"


def mapa_linhas(antes, depois):
    """Linha antiga (1..n) -> linha nova correspondente (ou a próxima que sobreviveu)."""
    m = {}
    for tag, i1, i2, j1, j2 in difflib.SequenceMatcher(None, antes, depois, autojunk=False).get_opcodes():
        for k in range(i1, i2):
            m[k + 1] = (j1 + (k - i1) + 1) if tag == "equal" else (j1 + 1 if j1 < j2 or tag == "delete" else j1 + 1)
    m[len(antes) + 1] = len(depois) + 1
    return m


def main():
    s = P.read_text(encoding="utf-8")
    blocos = list(re.finditer(r'arquivo\("([^"]+)"', s))
    for n, b in enumerate(blocos):
        caminho = b.group(1)
        fim_bloco = blocos[n + 1].start() if n + 1 < len(blocos) else len(s)
        try:
            antes = subprocess.run(["git", "show", "HEAD:" + caminho], cwd=RAIZ, capture_output=True, check=True,
                                   encoding="utf-8").stdout.splitlines()
        except subprocess.CalledProcessError:
            continue  # arquivo novo, sem versão anterior
        depois = (RAIZ / caminho).read_text(encoding="utf-8").splitlines()
        if antes == depois:
            continue
        m = mapa_linhas(antes, depois)
        trecho = s[b.start():fim_bloco]
        pares = [(int(x.group(1)), int(x.group(2))) for x in re.finditer(r"^\((\d+), (\d+), ", trecho, flags=re.M)]
        novos = [m[a] for a, _ in pares]
        # cada trecho vai até a linha antes do próximo (assim nada novo fica sem explicação)
        finais = [novos[k + 1] - 1 for k in range(len(novos) - 1)] + [len(depois)]
        it = iter(zip(novos, finais))

        def troca(x):
            a, f = next(it)
            return "(%d, %d, " % (a, max(a, f))
        trecho = re.sub(r"^\((\d+), (\d+), ", troca, trecho, flags=re.M)
        s = s[:b.start()] + trecho + s[fim_bloco:]
        print("realinhado:", caminho)
    P.write_text(s, encoding="utf-8", newline="\n")


if __name__ == "__main__":
    main()
