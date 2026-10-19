import { Link } from 'react-router-dom'
import { Clock } from 'lucide-react'
import { mediaUrl } from '../../utils/media.js'
import { dateLabel } from '../../utils/format.js'

export default function PostCard({ post }) {
  return (
    <article className="post-card">
      <Link to={`/blog/${post.slug}`} className="post-media" tabIndex={-1} aria-hidden="true">
        <img
          src={mediaUrl(post.cover_image_url)}
          alt=""
          loading="lazy"
          onError={(event) => {
            event.currentTarget.src = mediaUrl('')
          }}
        />
      </Link>
      <div className="post-body">
        <div className="row" style={{ gap: 8 }}>
          {post.category_name ? (
            <span className="badge badge-outline">{post.category_name}</span>
          ) : null}
          {post.is_featured ? <span className="badge badge-red">Featured</span> : null}
        </div>
        <h3 className="post-title">
          <Link className="stretched-link" to={`/blog/${post.slug}`}>
            {post.title}
          </Link>
        </h3>
        {post.excerpt_text ? <p className="muted" style={{ margin: 0 }}>{post.excerpt_text}</p> : null}
        <div className="post-meta">
          <span>{dateLabel(post.published_at || post.created_at)}</span>
          {post.reading_time ? (
            <span className="row" style={{ gap: 4 }}>
              <Clock size={13} aria-hidden="true" /> {post.reading_time} min read
            </span>
          ) : null}
          {post.author_name ? <span>{post.author_name}</span> : null}
        </div>
      </div>
    </article>
  )
}
