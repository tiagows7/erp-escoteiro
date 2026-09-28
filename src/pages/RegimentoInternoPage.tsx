import {
  GrupoDocumentoPdfPage,
  type GrupoDocumentoPdfConfig,
} from '@/pages/GrupoDocumentoPdfPage'

const REGIMENTO: GrupoDocumentoPdfConfig = {
  title: 'Regimento interno',
  column: 'regimento_interno',
  storageFile: 'regimento.pdf',
  downloadName: 'regimento-interno.pdf',
  cardLabel: 'Regimento interno (PDF)',
  emptyAdmin:
    'Nenhum PDF cadastrado. Use Cadastrar PDF para enviar o regimento.',
  emptyViewer: 'O regimento interno ainda não foi publicado pelo grupo.',
  removeMessage: 'O regimento interno deixará de aparecer para os associados.',
  savedToast: 'Regimento PDF salvo',
  removedToast: 'Regimento removido',
}

export function RegimentoInternoPage() {
  return <GrupoDocumentoPdfPage config={REGIMENTO} />
}
