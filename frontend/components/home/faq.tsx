/**
 * Frequently asked questions.
 *
 * Two columns on desktop: a standing offer of help on the left, the accordion
 * on the right. The questions are the ones that decide whether a first-time
 * cash-on-delivery order happens at all - delivery time, authenticity, and what
 * happens when something is wrong.
 *
 * Answers render into the DOM whether or not the panel is open, so they are
 * indexable and findable with the browser's own search.
 */

import { faqs, socialLinks } from "@/lib/config/site";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Reveal } from "@/components/motion/reveal";
import { container } from "./section";

export function Faq() {
  const whatsapp = socialLinks.find((link) => link.label === "WhatsApp");

  return (
    <section id="faq" className="border-t bg-muted/30 py-12 lg:py-16">
      <div className={container}>
        <div className="grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:gap-12">
          <Reveal className="lg:sticky lg:top-32 lg:self-start">
            <span className="mb-2 inline-flex items-center gap-2 rounded-full bg-brand/15 px-3 py-1 text-xs font-semibold tracking-wide text-brand-foreground uppercase dark:text-brand">
              Questions
            </span>
            <h2 className="font-heading text-2xl font-bold tracking-tight text-balance lg:text-3xl">
              Everything you might be wondering
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Still not sure about something? Our team answers on WhatsApp
              within a few minutes, seven days a week until 10pm.
            </p>

            {/* WhatsApp is the only support channel offered here - a second
                button competing with it just splits the intent. */}
            {whatsapp && (
              <div className="mt-6">
                <Button
                  size="lg"
                  className="h-12 cursor-pointer gap-2 px-6"
                  render={
                    <a
                      href={whatsapp.href}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  }
                >
                  <whatsapp.icon className="size-5" aria-hidden />
                  Chat on WhatsApp
                </Button>
              </div>
            )}
          </Reveal>

          <Reveal delay={0.1}>
            {/* `multiple={false}` so opening one answer collapses the last -
                on a phone, three expanded panels bury the rest of the list. */}
            <Accordion
              multiple={false}
              defaultValue={[faqs[0].question]}
              className="rounded-xl border bg-card px-4 lg:px-6"
            >
              {faqs.map((faq) => (
                <AccordionItem key={faq.question} value={faq.question}>
                  <AccordionTrigger className="py-4 text-left text-base font-semibold hover:no-underline">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="pr-6 pb-4 text-sm leading-relaxed text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
