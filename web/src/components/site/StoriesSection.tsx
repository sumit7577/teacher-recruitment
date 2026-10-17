import Column from "@/components/common/Column";
import Row from "@/components/common/Row";
import type { SuccessStoryResp } from "@/networking/types";

/**
 * Section 8's success stories.
 *
 * Distinct from the testimonials strip, which is quotes. A story is an outcome
 * with a number on it — who, where, how many days — and that is what persuades
 * a principal who has been let down by a consultant before. "Great service"
 * does not.
 *
 * A server component: nothing here is interactive, and it renders inside the
 * homepage's existing data fetch rather than adding a round trip.
 */
export default function StoriesSection({ stories }: { stories: SuccessStoryResp[] }) {
  const published = stories.filter((story) => story.is_published);
  if (!published.length) return null;

  return (
    <section className="border-y border-line bg-surface">
      <Column className="mx-auto w-full max-w-6xl gap-6 px-4 py-14 sm:px-6">
        <Column className="gap-1.5">
          <h2 className="font-display text-2xl font-extrabold text-ink-1 sm:text-3xl">
            Placements we have made
          </h2>
          <p className="text-base text-ink-2">
            Real posts, filled. Names are given where both sides agreed to it.
          </p>
        </Column>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {published.map((story) => (
            <Column key={story.id} className="card gap-2 p-5">
              {story.days_to_place ? (
                <span className="chip chip-accent w-fit">
                  {story.days_to_place} days
                </span>
              ) : null}
              <h3 className="font-display text-base font-bold text-ink-1">{story.headline}</h3>
              {story.body ? (
                <p className="text-sm leading-relaxed text-ink-2">{story.body}</p>
              ) : null}
              <Row className="flex-wrap gap-1.5 pt-1">
                {story.post_label ? <span className="chip">{story.post_label}</span> : null}
                {story.city ? <span className="chip">{story.city}</span> : null}
              </Row>
              {story.institution_name ? (
                <span className="text-xs text-ink-3">{story.institution_name}</span>
              ) : null}
            </Column>
          ))}
        </div>
      </Column>
    </section>
  );
}
