'use client'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useRouter } from 'next/navigation'
import toast from 'react-hot-toast'
import { Upload, FileImage, AlertCircle, ArrowRight, Loader2 } from 'lucide-react'
import type { OcrResult } from '@/types'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export default function StudyoUploadPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const f = acceptedFiles[0]
    if (!f) return

    if (f.size > MAX_FILE_SIZE) {
      toast.error('Dosya 10MB\'dan küçük olmalıdır.')
      return
    }

    setFile(f)
    if (f.type.startsWith('image/')) {
      setPreview(URL.createObjectURL(f))
    } else {
      setPreview(null)
    }
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
      'application/pdf': ['.pdf'],
    },
    multiple: false,
    maxSize: MAX_FILE_SIZE,
  })

  async function handleAnalyze() {
    if (!file) return
    setLoading(true)

    try {
      // Dosyayı base64'e çevir
      const arrayBuffer = await file.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')

      const response = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType: file.type,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        toast.error(result.error ?? 'Menü okunamadı.')
        return
      }

      const ocrResult: OcrResult = result.data

      if (ocrResult.items.length === 0) {
        toast.error('Menüde ürün bulunamadı. Daha net bir fotoğraf deneyin.')
        return
      }

      // Session token oluştur ve localStorage'a kaydet
      const sessionToken = crypto.randomUUID()
      localStorage.setItem('ros_session', JSON.stringify({
        sessionToken,
        step: 2,
        ocrResult,
      }))

      if (ocrResult.low_confidence_detected) {
        toast('Menüde bazı okunamayan bölgeler tespit edildi. Bir sonraki adımda düzeltebilirsiniz.', {
          icon: '⚠️',
          duration: 5000,
        })
      } else {
        toast.success(`${ocrResult.items.length} ürün başarıyla tanındı!`)
      }

      router.push('/studyo/duzelt')
    } catch {
      toast.error('Beklenmeyen bir hata oluştu. Lütfen tekrar deneyin.')
    } finally {
      setLoading(false)
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
          {/* Adım göstergesi */}
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
            <br />Fotoğraf ne kadar net olursa sonuç o kadar doğru olur.
          </p>
        </div>

        {/* Dropzone */}
        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-3xl p-12 text-center cursor-pointer transition-all
            ${isDragActive
              ? 'border-teal-500 bg-teal-50'
              : file
                ? 'border-teal-400 bg-teal-50/50'
                : 'border-gray-300 bg-white hover:border-teal-400 hover:bg-gray-50'
            }
          `}
        >
          <input {...getInputProps()} />

          {preview ? (
            <div className="space-y-4">
              <img
                src={preview}
                alt="Menü önizleme"
                className="max-h-64 mx-auto rounded-xl object-contain shadow-md"
              />
              <p className="text-sm text-slate-500">{file?.name}</p>
              <p className="text-xs text-teal-600 font-medium">
                ✓ Dosya hazır — analiz etmek için aşağıdaki butona tıklayın
              </p>
            </div>
          ) : file ? (
            <div className="space-y-3">
              <FileImage className="w-12 h-12 text-teal-500 mx-auto" />
              <p className="font-medium text-slate-700">{file.name}</p>
              <p className="text-xs text-teal-600">PDF yüklendi</p>
            </div>
          ) : (
            <div className="space-y-4">
              <Upload className={`w-12 h-12 mx-auto transition-colors ${isDragActive ? 'text-teal-500' : 'text-slate-300'}`} />
              <div>
                <p className="font-semibold text-slate-700 text-lg">
                  {isDragActive ? 'Bırakın!' : 'Menü fotoğrafını sürükleyin'}
                </p>
                <p className="text-slate-400 text-sm mt-1">ya da tıklayarak seçin</p>
              </div>
              <p className="text-xs text-slate-400">JPG, PNG, PDF · Maks 10MB</p>
            </div>
          )}
        </div>

        {/* Uyarı */}
        <div className="mt-4 flex gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            En iyi sonuç için menüyü düz, iyi ışıklı bir ortamda fotoğraflayın.
            Yamuk veya bulanık fotoğraflarda AI bazı ürünleri karıştırabilir —
            bir sonraki adımda düzeltme imkânınız olacak.
          </p>
        </div>

        {/* Analiz butonu */}
        {file && (
          <div className="mt-8 text-center">
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="btn-primary text-base px-8 py-4 rounded-2xl shadow-lg shadow-teal-200"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Menü okunuyor...
                </>
              ) : (
                <>
                  Menüyü Analiz Et
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
            {loading && (
              <p className="mt-3 text-sm text-slate-400 animate-pulse">
                AI menünüzü okuyor. Bu işlem 10-20 saniye sürebilir.
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
