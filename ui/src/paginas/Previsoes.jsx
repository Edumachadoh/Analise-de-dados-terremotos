// Tela 5: probabilidade de terremoto por região nos próximos 30 dias (GET /api/previsoes/)

import { useMemo, useState } from 'react'
import { Rectangle, Tooltip } from 'react-leaflet'
import { api } from '../api/index.js'
import { Aviso, Cabecalho, Carregando, Cartao, Metrica, Seletor } from '../componentes/comuns.jsx'
import { corDaRampa, MapaBase, RAMPA } from '../componentes/MapaBase.jsx'
import { formatarData, formatarInteiro, formatarNumero, formatarPorcentagem } from '../lib/formato.js'
import { useCarregar } from '../lib/useCarregar.js'

const LIMITES = [['10', '10 regiões'], ['25', '25 regiões'], ['50', '50 regiões'], ['', 'Todas (mais lento)']]

export default function Previsoes({ versaoBase }) {
  const [limite, setLimite] = useState('50')
  const { dados, erro, carregando } = useCarregar(() => api.previsoes({ limite }), [limite, versaoBase])

  const celulas = useMemo(() => dados?.celulas ?? [], [dados])
  const maxima = celulas.length ? Math.max(...celulas.map((c) => c.probabilidade)) : 1
  const limitesMapa = useMemo(() => (celulas.length
    ? [[Math.min(...celulas.map((c) => c.latitude_min)), Math.min(...celulas.map((c) => c.longitude_min))],
       [Math.max(...celulas.map((c) => c.latitude_max)), Math.max(...celulas.map((c) => c.longitude_max))]]
    : null), [celulas])

  // Sem modelo treinado o back responde 404 com orientação
  const semModelo = erro?.includes('Nenhum modelo')

  return (
    <>
      <Cabecalho titulo="Previsões">
        Probabilidade de cada região do Chile ter um terremoto nos próximos 30 dias, segundo o modelo ativo
      </Cabecalho>

      {semModelo && <Aviso>Não há um modelo ativo. Vá até a tela <strong>Modelos</strong>, treine um novo ou ative um existente e volte aqui.</Aviso>}
      {erro && !semModelo && <Aviso tipo="erro">{erro}</Aviso>}
      {carregando && !dados && !erro && <Carregando texto="Calculando as previsões… (o back leva alguns segundos)" />}

      {dados && (
        <>
          <div className="metricas">
            <Metrica rotulo="Modelo ativo" valor={`nº ${dados.modelo}`} detalhe={dados.algoritmo.replaceAll('_', ' ')} />
            <Metrica rotulo="Magnitude prevista" valor={`≥ ${formatarNumero(dados.magnitude_alvo)}`} />
            <Metrica rotulo="Período previsto" valor={formatarData(dados.periodo_previsto.inicio)}
              detalhe={`até ${formatarData(dados.periodo_previsto.fim)}`} />
            <Metrica rotulo="Regiões exibidas" valor={formatarInteiro(dados.total_celulas)} />
          </div>

          <div className="grade-cartoes">
            <Cartao largo titulo="Mapa de probabilidade"
              subtitulo="Quanto mais escura a região, maior a probabilidade · passe o mouse para ver o valor"
              controles={<Seletor rotulo="Mostrar" valor={limite} opcoes={LIMITES} aoMudar={setLimite} />}>
              <MapaBase limites={limitesMapa} chave={`${dados.modelo}-${dados.total_celulas}`}>
                {celulas.map((c) => (
                  <Rectangle key={`${c.latitude_min}-${c.longitude_min}`}
                    bounds={[[c.latitude_min, c.longitude_min], [c.latitude_max, c.longitude_max]]}
                    pathOptions={{ color: '#fff', weight: 1, fillColor: corDaRampa(c.probabilidade, 0, maxima), fillOpacity: 0.65 }}>
                    <Tooltip sticky>
                      <strong>Probabilidade: {formatarPorcentagem(c.probabilidade)}</strong><br />
                      Centro: {formatarNumero(c.centro.latitude, 2)}°, {formatarNumero(c.centro.longitude, 2)}°<br />
                      Eventos nos últimos 12 meses: {formatarInteiro(c.eventos_ultimos_12_periodos)}<br />
                      Frequência histórica: {formatarPorcentagem(c.taxa_historica)}
                    </Tooltip>
                  </Rectangle>
                ))}
              </MapaBase>
              <div className="legenda">
                <span>Probabilidade:</span>
                {RAMPA.map((cor, i) => (
                  <span className="item" key={cor}>
                    <span className="amostra" style={{ background: cor }} />
                    {formatarPorcentagem((maxima * i) / RAMPA.length, 0)}–{formatarPorcentagem((maxima * (i + 1)) / RAMPA.length, 0)}
                  </span>
                ))}
              </div>
            </Cartao>

            <Cartao largo titulo="Regiões mais prováveis" subtitulo="Ordenadas da maior para a menor probabilidade">
              <div className="tabela-rolagem">
                <table>
                  <thead>
                    <tr><th>#</th><th>Região (centro)</th><th>Probabilidade</th><th /><th>Eventos em 12 meses</th><th>Frequência histórica</th></tr>
                  </thead>
                  <tbody>
                    {celulas.slice(0, 50).map((c, i) => (
                      <tr key={`${c.latitude_min}-${c.longitude_min}`}>
                        <td>{i + 1}</td>
                        <td>{formatarNumero(c.centro.latitude, 2)}°, {formatarNumero(c.centro.longitude, 2)}°</td>
                        <td className="num">{formatarPorcentagem(c.probabilidade)}</td>
                        <td style={{ width: 160 }}>
                          <div className="barra-prob" style={{ display: 'block', padding: 0, border: 0 }}>
                            <div className="trilho"><div className="preenchido" style={{ width: `${c.probabilidade * 100}%` }} /></div>
                          </div>
                        </td>
                        <td className="num">{formatarInteiro(c.eventos_ultimos_12_periodos)}</td>
                        <td className="num">{formatarPorcentagem(c.taxa_historica)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {celulas.length > 50 && <p className="texto-explicacao">Mostrando as 50 primeiras; todas aparecem no mapa.</p>}
            </Cartao>
          </div>
        </>
      )}
    </>
  )
}
