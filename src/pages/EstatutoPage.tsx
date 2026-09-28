import {
  GrupoDocumentoPdfPage,
  type GrupoDocumentoPdfConfig,
} from '@/pages/GrupoDocumentoPdfPage'

const ESTATUTO: GrupoDocumentoPdfConfig = {
  title: 'Estatuto',
  column: 'estatuto',
  storageFile: 'estatuto.pdf',
  downloadName: 'estatuto.pdf',
  cardLabel: 'Estatuto (PDF)',
  emptyAdmin:
    'Nenhum PDF cadastrado. Use Cadastrar PDF para enviar o estatuto.',
  emptyViewer: 'O estatuto ainda não foi publicado pelo grupo.',
  removeMessage: 'O estatuto deixará de aparecer para os associados.',
  savedToast: 'Estatuto PDF salvo',
  removedToast: 'Estatuto removido',
}

export function EstatutoPage() {
  return <GrupoDocumentoPdfPage config={ESTATUTO} />
}
