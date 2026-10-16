import { useEffect } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { CalendarDays, Eye, MessageSquareOff } from 'lucide-react'
import { postBySlug } from '../../api/blog.js'
import { useApi } from '../../hooks/useApi.js'
import { useLookups } from '../../context/LookupContext.jsx'
import { companyLogo, mediaUrl } from '../../utils/media.js'
import { dateLabel } from '../../utils/format.js'
import PostCard from '../../components/blog/PostCard.jsx'
import { Breadcrumb, Callout, Avatar } from '../../components/ui/Blocks.jsx'
import { Button } from '../../components/ui/Button.jsx'
import { ErrorState, Loading } from '../../components/ui/Feedback.jsx'
import { isNotFound } from '../../api/client.js'

export default function BlogPost() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const { company } = useLookups()
  const request = useApi(() => postBySlug(slug), [slug])

  useEffect(() => {
    if (isNotFound(request.error)) navigate('/blog', { replace: true })
  }, [request.error, navigate])

  if (request.loading && !request.data) return <Loading label="Opening the article…" />
  if (request.error) {
    return (
      <div className="container section-tight">
        <ErrorState error={request.error} onRetry={request.reload} title="This article could not be opened" />
      </div>
    )
  }

  const post = request.data
  if (!post) return null

  return (
    <article className="container section-tight stack">
      <Breadcrumb
        items={[
          { label: 'Home', to: '/' },
          { label: 'Blog', to: '/blog' },
          { label: post.category_name || 'Article' },
        ]}
      />

      <div className="split">
        <div className="stack">
          <header className="article">
            <div className="row" style={{ gap: 8 }}>
              {post.category_slug ? (
                <Link to={`/blog?category=${post.category_slug}`} className="badge badge-navy">
                  {post.category_name}
                </Link>
              ) : null}
              {post.is_featured ? <span className="badge badge-red">Featured</span> : null}
            </div>
            <h1 style={{ marginTop: 12, marginBottom: 10 }}>{post.title}</h1>
            <div className="article-head row" style={{ gap: 16, flexWrap: 'wrap' }}>
              <span className="row" style={{ gap: 8 }}>
                <CalendarDays size={14} aria-hidden="true" />
                {dateLabel(post.published_at || post.created_at)}
              </span>
              {post.reading_time ? <span className="muted small">{post.reading_time} min read</span> : null}
              {post.views ? (
                <span className="row muted small" style={{ gap: 5 }}>
                  <Eye size={13} aria-hidden="true" /> {post.views.toLocaleString()} views
                </span>
              ) : null}
              {post.author ? (
                <span className="row" style={{ gap: 8 }}>
                  <Avatar user={post.author} size="sm" />
                  <span className="small">Written by {post.author.full_name}</span>
                </span>
              ) : null}
            </div>

            {post.cover_image_url ? (
              <img
                src={mediaUrl(post.cover_image_url)}
                alt=""
                className="cover-img"
                onError={(event) => {
                  event.currentTarget.style.display = 'none'
                }}
              />
            ) : null}

            <div className="article-body" style={{ marginTop: 22 }}>
              {(post.paragraphs ?? []).map((paragraph, index) => (
                <p key={`${post.slug}-${index}`}>{paragraph}</p>
              ))}
            </div>

            {post.tags?.length ? (
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {post.tags.map((tag) => (
                  <Link key={tag} to={`/blog?tag=${encodeURIComponent(tag)}`} className="chip">
                    #{tag}
                  </Link>
                ))}
              </div>
            ) : null}

            {post.allow_comments ? (
              <Callout>
                <span className="row" style={{ gap: 8 }}>
                  <MessageSquareOff size={15} aria-hidden="true" />
                  This article is marked as open for comments, but the site has no comment API yet.{' '}
                  <Link to="/contact">Write to the desk</Link> instead.
                </span>
              </Callout>
            ) : null}
          </header>
        </div>

        <aside className="sticky-side stack">
          <div className="card">
            <div className="card-head">
              <h3>About the writer</h3>
            </div>
            <div className="card-body stack stack-sm">
              <div className="row" style={{ gap: 10 }}>
                <Avatar user={post.author} />
                <div>
                  <p className="bold" style={{ margin: 0 }}>
                    {post.author?.full_name ?? post.author_name}
                  </p>
                  <p className="muted small" style={{ margin: 0 }}>
                    {post.author?.role === 'ADMIN' ? 'Mant Bridges LTD' : 'Contributor'}
                  </p>
                </div>
              </div>
              <p className="muted small" style={{ margin: 0 }}>
                {company?.name ?? 'Mant Bridges LTD'} — {company?.tagline ?? 'Property and rent management in Uganda.'}
              </p>
              {companyLogo(company) ? (
                <img src={companyLogo(company)} alt="" style={{ maxHeight: 44, objectFit: 'contain' }} />
              ) : null}
              <Button to="/contact" variant="outline" block size="sm">
                Ask about this topic
              </Button>
            </div>
          </div>

          <div className="card">
            <div className="card-body stack stack-sm">
              <Button to="/properties" variant="link" block size="sm">
                Browse current listings
              </Button>
              <Button to="/blog" variant="outline" block size="sm">
                All articles
              </Button>
            </div>
          </div>
        </aside>
      </div>

      {post.related_posts?.length ? (
        <section className="stack stack-sm">
          <h2>Related reading</h2>
          <div className="auto-grid">
            {post.related_posts.map((item) => (
              <PostCard key={item.id} post={item} />
            ))}
          </div>
        </section>
      ) : null}
    </article>
  )
}
