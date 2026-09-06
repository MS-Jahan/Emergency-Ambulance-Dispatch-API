export interface ApiErrorItem {
  field?: string
  message: string
}

export interface PaginationMeta {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface PaginatedData<T> {
  items: T[]
  meta: PaginationMeta
}

export interface SuccessEnvelope<T> {
  success: true
  message: string
  data: T
}

export interface ErrorEnvelope {
  success: false
  message: string
  errors: ApiErrorItem[]
}
