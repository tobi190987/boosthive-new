-- PROJ-29: Customer Documents File Upload Support

-- 1. Add doc_type and file_name columns to customer_documents
ALTER TABLE customer_documents
ADD COLUMN IF NOT EXISTS doc_type TEXT DEFAULT 'link' CHECK (doc_type IN ('link', 'file')),
ADD COLUMN IF NOT EXISTS file_name TEXT;

-- 2. Create storage bucket for customer documents
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'customer-documents',
  'customer-documents',
  true,
  20971520, -- 20MB
  ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.ms-excel',
    'text/csv',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
) ON CONFLICT (id) DO NOTHING;
