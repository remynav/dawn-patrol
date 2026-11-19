import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'
import { refreshNow } from './refresh-now'
import { searchTown } from './search-town'

export const actions: Record<string, ActionHandler<Env>> = {
  searchTown,
  refreshNow,
}
