'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Upload, FileImage, AlertCircle, ArrowRight, Loader2, X, ImagePlus } from 'lucide-react'
import type { OcrResult, OcrMenuItem } from '@/types'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const MAX_FILES = 10

interface UploadedFile {
  file: File
  preview: string | null
  id: string
}

export default function StudyoUploadPage() {
  const router = useRouter()
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [loading, setLoading] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0 })

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const newFiles: UploadedFile[] = []
    for (const f of acceptedFiles) {
      if (f.size > MAX_FILE_SIZE) {
        toast.error(`${f.name}: 10MB'dan büyük, atlandı.`)
        continue
      }
      newFiles.push({
        file: f,
        preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null,
        id: crypto.randomUUID(),
      })
    }

    setFiles((prev) => {
      const combined = [...prev, ...newFiles].slice(0, MAX_FILES)
      if (prev.length + newFiles.length > MAX_FILES) {
        toast.error(`En fazla ${MAX_FILES} dosya yükleyebilirsiniz.`)
      }
      return combined
    })
  }, [])

  const removeFile = useCallback((id: string) => {
    setFiles((prev) => {
      const removed = prev.find((f) => f.id === id)
      if (removed?.preview) URL.revokeObjectURL(removed.preview)
      return prev.filter((f) => f.id !== id)
    })
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'application/pdf': ['.pdf'],
    },
    multiple: true,
    maxFiles: MAX_FILES,
    maxSize: MAX_FILE_SIZE,
  })

  async function handleAnalyze() {
    if (files.length === 0) return
    setLoading(true)
    setProgress({ current: 0, total: files.length })

    try {
      const allItems: OcrMenuItem[] = []
      let anyLowConfidence = false
      let totalMs = 0

      // Her dosyayı sırayla OCR'a gönder
      for (let i = 0; i < files.length; i++) {
        setProgress({ current: i + 1, total: files.length })

        const f = files[i].file
        const arrayBuffer = await f.arrayBuffer()
        const base64 = Buffer.from(arrayBuffer).toString('base64')

        const response = await fetch('/api/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: base64,
            mimeType: f.type,
          }),
        })

        const result = await response.json()

        if (!result.success) {
          toast.error(`${f.name}: ${result.error ?? 'Okunamadı.'}`)
          continue
        }

        const ocrResult: OcrResult = result.data
        allItems.push(...ocrResult.items)
        if (ocrResult.low_confidence_detected) anyLowConfidence = true
        totalMs += ocrResult.processing_time_ms
      }

      if (allItems.length === 0) {
        toast.error('Hiçbir dosyada ürün bulunamadı. Daha net fotoğraflar deneyin.')
        return
      }

      // Birleşik sonucu session'a kaydet
      const mergedResult: OcrResult = {
        items: allItems,
        raw_text: '',
        low_confidence_detected: anyLowConfidence,
        processing_time_ms: totalMs,
      }

      const sessionToken = crypto.randomUUID()
      localStorage.setItem('ros_session', JSON.stringify({
        sessionToken,
        step: 2,
        ocrResult: mergedResult,
      }))

      if (anyLowConfidence) {
        toast('Bazı sayfalarda okunamayan bölgeler var. Bir sonraki adımda düzeltebilirsiniz.', {
          icon: '⚠️',
          duration: 5000,
        })
      } else {
        toast.success(`${files.length} sayfa okundu — ${allItems.length} ürün tanındı!`)
      }

      router.push('/studyo/duzelt')
    } catch {
      toast.error('Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.')
    } finally {
      setLoading(false)
      setProgress({ current: 0, total: 0 })
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-[#0D1B2A] border-b border-[#1E3A52]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <span className="font-display font-bold text-white text-xl">Restaurant<span className="text-teal-400">OS</span></span>
            <span className="ml-3 text-xs text-slate-500 font-mono">Menü Stüdyosu</span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {['Yükle', 'Düzelt', 'Uyum', 'Bilgiler', 'Önizle', 'Yayınla'].map((label, i) => (
              <div key={label} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                  i === 0 ? 'bg-teal-500 text-white' : 'bg-[#1E3A52] text-slate-500'
                }`}>
                  {i + 1}
                </div>
                <span className={i === 0 ? 'text-white' : 'text-slate-600'}>{label}</span>
                {i < 5 && <span className="text-slate-700">›</span>}
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="font-display text-3xl font-bold text-[#0D1B2A] mb-3">
            Menünüzü yükleyin
          </h1>
          <p className="text-slate-500 text-lg">
            AI menünüzü okuyup tüm ürünleri otomatik çıkaracak.
            <br />Birden fazla sayfa varsa hepsini seçebilirsiniz (en fazla {MAX_FILES}).
          </p>
        </div>

        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-3xl p-12 text-center cursor-pointer transition-all
            ${isDragActive
              ? 'border-teal-500 bg-teal-50'
              : files.length > 0
                ? 'border-teal-400 bg-teal-50/50'
                : 'border-gray-300 bg-white hover:border-teal-400 hover:bg-gray-50'
            }
          `}
        >
          <input {...getInputProps()} />

          {files.length === 0 ? (
            <div className="space-y-4">
              <Upload className={`w-12 h-12 mx-auto transition-colors ${isDragActive ? 'text-teal-500' : 'text-slate-300'}`} />
              <div>
                <p className="font-semibold text-slate-700 text-lg">
                  {isDragActive ? 'Bırakın!' : 'Menü fotoğraflarını sürükleyin'}
                </p>
                <p className="text-slate-400 text-sm mt-1">ya da tıklayarak seçin · birden fazla dosya seçebilirsiniz</p>
              </div>
              <p className="text-xs text-slate-400">JPG, PNG, PDF · Her dosya maks 10MB · En fazla {MAX_FILES} dosya</p>
            </div>
          ) : (
            <div className="space-y-2">
              <ImagePlus className="w-8 h-8 text-teal-400 mx-auto" />
              <p className="text-sm text-teal-600 font-medium">
                Daha fazla eklemek için tıklayın veya sürükleyin
              </p>
            </div>
          )}
        </div>

        {/* Yüklenen dosyalar */}
        {files.length > 0 && (
          <div className="mt-6 grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
            {files.map((uf, idx) => (
              <div key={uf.id} className="relative group aspect-square rounded-xl border border-gray-200 bg-white overflow-hidden">
                {uf.preview ? (
                  <img src={uf.preview} alt={`Sayfa ${idx + 1}`} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center gap-1 text-teal-500">
                    <FileImage className="w-8 h-8" />
                    <span className="text-xs">PDF</span>
                  </div>
                )}
                {/* Sıra numarası */}
                <div className="absolute bottom-1 left-1 bg-black/60 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {idx + 1}
                </div>
                {/* Sil butonu */}
                <button
                  onClick={(e) => { e.stopPropagation(); removeFile(uf.id) }}
                  className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Uyarı */}
        <div className="mt-4 flex gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            En iyi sonuç için menüyü düz, iyi ışıklı bir ortamda fotoğraflayın.
            Birden fazla sayfa varsa hepsini aynı anda yükleyebilirsiniz —
            AI tüm sayfaları okuyup ürünleri birleştirecek.
          </p>
        </div>

        {/* Analiz butonu */}
        {files.length > 0 && (
          <div className="mt-8 text-center">
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="btn-primary text-base px-8 py-4 rounded-2xl shadow-lg shadow-teal-200"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  {progress.total > 1
                    ? `Sayfa ${progress.current}/${progress.total} okunuyor...`
                    : 'Menü okunuyor...'}
                </>
              ) : (
                <>
                  {files.length > 1
                    ? `${files.length} Sayfayı Analiz Et`
                    : 'Menüyü Analiz Et'}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
            {loading && progress.total > 1 && (
              <div className="mt-3 max-w-xs mx-auto">
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-teal-500 rounded-full transition-all duration-500"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  {progress.current}/{progress.total} sayfa tamamlandı
                </p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
