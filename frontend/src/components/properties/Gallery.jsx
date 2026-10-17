import { useEffect, useState } from 'react'
import { mediaUrl } from '../../utils/media.js'

export default function Gallery({ images = [], title = 'Property' }) {
  const [active, setActive] = useState(0)

  useEffect(() => {
    setActive(0)
  }, [title])

  if (!images.length) {
    return (
      <div className="gallery-main">
        <img src={mediaUrl('')} alt={`No photography uploaded for ${title} yet`} />
      </div>
    )
  }

  const current = images[Math.min(active, images.length - 1)]

  return (
    <div>
      <div className="gallery-main">
        <img
          src={mediaUrl(current.image_url)}
          alt={current.alt_text || current.caption || `${title} — photo ${active + 1}`}
          onError={(event) => {
            event.currentTarget.src = mediaUrl('')
          }}
        />
        {current.is_illustrative ? (
          <p className="gallery-note">Illustrative render — not a photograph of this property</p>
        ) : null}
      </div>
      {images.length > 1 ? (
        <div className="gallery-thumbs" role="group" aria-label="Photo thumbnails">
          {images.map((image, index) => (
            <button
              type="button"
              key={image.id ?? index}
              className={`gallery-thumb${index === active ? ' active' : ''}`}
              onClick={() => setActive(index)}
              aria-label={`Show photo ${index + 1}`}
              aria-current={index === active}
            >
              <img src={mediaUrl(image.image_url)} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
