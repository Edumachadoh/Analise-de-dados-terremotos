# Casos de teste do upload de CSV

Arquivos para testar manualmente o endpoint `POST /api/coletas/upload/`.

Com a API rodando (`python manage.py runserver`), envie cada arquivo pelo formulário em
http://127.0.0.1:8000/api/coletas/upload/ ou pelo terminal, a partir de `backend/`:

```powershell
curl.exe -F "arquivo=@data/testes_upload/01_valido.csv" http://127.0.0.1:8000/api/coletas/upload/
curl.exe -F "arquivo=@data/testes_upload/01_valido.csv" -F "magnitude_minima=5.0" http://127.0.0.1:8000/api/coletas/upload/
```

Envie **na ordem dos números**: o caso 03 depende do 01 já ter sido enviado.

## Arquivos aceitos (201)

| Arquivo | O que testa | Resultado esperado |
|---|---|---|
| `01_valido.csv` | 3 terremotos válidos, `time` em milissegundos | novos: 3 |
| `02_time_formato_iso.csv` | `time` como data ISO (`2025-06-01 00:00:00.000000`) | novos: 2 |
| `03_reenvio_atualiza.csv` | 2 ids do caso 01 com magnitude nova | novos: 0, atualizados: 2 (não duplica) |
| `04_colunas_extras_ignoradas.csv` | colunas a mais (`pais`, `observacao`) | aceito; colunas extras ignoradas |
| `05_so_colunas_obrigatorias.csv` | só `id, mag, time, latitude, longitude, depth` | novos: 1 |
| `06_extensao_maiuscula.CSV` | extensão `.CSV` em maiúsculas | aceito |
| `01_valido.csv` com `magnitude_minima=5.0` | filtro de magnitude configurável | 1 recebido, 2 descartados |

## Linhas descartadas (201, com aviso)

O arquivo é aceito, mas as linhas ruins não entram. A quantidade aparece no campo `mensagem`.

| Arquivo | O que testa | Resultado esperado |
|---|---|---|
| `07_linhas_invalidas.csv` | latitude 120, magnitude vazia, magnitude `abc`, time `ontem`, `quarry blast`, magnitude 1,2 | novos: 1, "6 linha(s) descartada(s)" |
| `08_ids_duplicados.csv` | o mesmo id duas vezes no arquivo | novos: 1 (fica a última versão), "1 linha(s) descartada(s)" |
| `09_so_cabecalho.csv` | cabeçalho sem nenhuma linha | novos: 0 |

## Arquivos rejeitados (400)

| Arquivo | O que testa | Resposta |
|---|---|---|
| `10_coluna_faltando.csv` | sem a coluna `mag` | `Colunas ausentes no CSV: ['mag']` |
| `11_nome_coluna_invalido.csv` | `latitud` no lugar de `latitude` | `Colunas ausentes no CSV: ['latitude']` |
| `12_varias_colunas_faltando.csv` | só `id, mag, place` | `Colunas ausentes no CSV: ['depth', 'latitude', 'longitude', 'time']` |
| `13_separador_ponto_e_virgula.csv` | separado por `;` (padrão do Excel em português) | `Colunas ausentes no CSV: [...]` (todas) |
| `14_encoding_latin1.csv` | salvo em Latin-1, não UTF-8 | `Não foi possível ler o CSV: 'utf-8' codec can't decode...` |
| `15_vazio.csv` | arquivo de 0 bytes | `O arquivo submetido está vázio.` |
| `16_texto_qualquer.csv` | texto que não é CSV de terremotos | `Colunas ausentes no CSV: [...]` (todas) |
| `17_formato_json.json` | extensão `.json` | `Formato .json não aceito. Envie: .csv.` |
| `18_formato_txt.txt` | extensão `.txt`, mesmo com conteúdo de CSV válido | `Formato .txt não aceito. Envie: .csv.` |
| `01_valido.csv` com `magnitude_minima=20` | magnitude fora da faixa | `Certifique-se de que este valor seja inferior ou igual a 10.` |

Nos casos 10 a 14 e 16, o arquivo chegou a ser lido: a coleta fica registrada em `GET /api/coletas/` com `status: "erro"` e a mensagem. Nos casos 15, 17, 18 e na magnitude inválida, a validação barra antes, e nenhuma coleta é criada.

## Limpar depois dos testes

Todos os terremotos de teste têm o id começando com `teste_`. Para removê-los, dentro de `backend/`:

```
python manage.py shell
```

```python
from api.models import Terremoto
Terremoto.objects.filter(usgs_id__startswith="teste_").delete()
exit()
```
