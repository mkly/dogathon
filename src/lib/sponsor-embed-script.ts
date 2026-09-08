export const sponsorEmbedScript = String.raw`(() => {
  "use strict";

  const PREFIX = "dogathon-sponsor-";
  const script = document.currentScript || Array.from(document.scripts).find((item) => /\/embed\.js(?:\?|$)/.test(item.src));
  const appOrigin = new URL(script && script.src ? script.src : window.location.href).origin;
  const pageUrl = new URL(window.location.href);
  const returnState = pageUrl.searchParams.get("sponsored") === "1"
    ? "sponsored"
    : pageUrl.searchParams.get("checkout") === "canceled"
      ? "canceled"
      : pageUrl.searchParams.has("error") ? "error" : null;
  const errorCode = pageUrl.searchParams.get("error");

  const create = (tag, suffix, text) => {
    const node = document.createElement(tag);
    if (suffix) node.className = PREFIX + suffix;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const link = (href, text) => {
    const node = create("a", "link", text);
    node.setAttribute("href", href);
    return node;
  };

  const message = (text, tone) => create("p", "message " + PREFIX + "message-" + tone, text);

  const isHidden = (root, part) => root.getAttribute("data-sponsor-" + part) === "hide";

  const sponsorIntro = (root, companionName) => {
    const configured = root.getAttribute("data-sponsor-intro");
    if (configured === "hide") return null;
    return configured || "A monthly sponsorship helps cover " + companionName + "'s care while they wait for a home.";
  };

  const sourceFor = (root) => {
    const configured = root.getAttribute("data-sponsor-source");
    if (configured) return new URL(configured, window.location.href).toString();
    const querySource = root.getAttribute("data-sponsor-mode") === "cta" ? null : pageUrl.searchParams.get("source");
    if (querySource) {
      try {
        const parsed = new URL(querySource);
        if (parsed.protocol === "http:" || parsed.protocol === "https:") return parsed.toString();
      } catch {
        // Ignore malformed query values and fall back to the current page URL.
      }
    }
    const source = new URL(window.location.href);
    source.hash = "";
    return source.toString();
  };

  const sponsorInfoUrl = (root, source) => {
    const configured = root.getAttribute("data-sponsor-info-url");
    if (!configured) return null;
    const infoUrl = new URL(configured, window.location.href);
    infoUrl.searchParams.set("source", source);
    return infoUrl.toString();
  };

  const rosterUrlFor = (root) => {
    const configured = root.getAttribute("data-sponsor-roster-url");
    if (!configured) return null;
    try {
      const parsed = new URL(configured);
      return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
    } catch {
      return null;
    }
  };

  const returnToFor = (root) => {
    const configured = root.getAttribute("data-sponsor-return");
    return configured ? new URL(configured, window.location.href).toString() : window.location.href;
  };

  const price = (monthlyCents, currency) => {
    try {
      return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: String(currency || "usd").toUpperCase(),
        maximumFractionDigits: 2,
      }).format(Number(monthlyCents) / 100) + " monthly";
    } catch {
      return "$" + (Number(monthlyCents) / 100).toFixed(2) + " monthly";
    }
  };

  const returnMessage = () => {
    if (returnState === "sponsored") {
      return message("Thank you! Your sponsorship is confirmed.", "success");
    }
    if (returnState === "canceled") {
      return message("Checkout was canceled. No payment was made.", "notice");
    }
    if (returnState === "error") {
      const errors = {
        invalid: "Please check your details and try again.",
        "invalid-tier": "Please choose a sponsorship tier and try again.",
        "rate-limited": "Too many checkout attempts. Please wait and try again.",
        unavailable: "This companion is not currently available for sponsorship.",
        billing: "Checkout is temporarily unavailable. Please try again later.",
      };
      return message(errors[errorCode] || "We could not start checkout. Please try again.", "error");
    }
    return null;
  };

  const tierFields = (tiers, monthlyCents, currency) => {
    const defaultTier = tiers.find((tier) => tier.isDefault === true) || tiers[0];
    // An organization that has never saved its sponsorship settings has no tiers, and checkout
    // falls back to the default price, so the card shows that price and posts no tier at all.
    if (tiers.length < 2) {
      const tier = defaultTier;
      const fields = document.createDocumentFragment();
      if (tier) {
        const selectedTier = create("input");
        selectedTier.setAttribute("type", "hidden");
        selectedTier.setAttribute("name", "tier");
        selectedTier.setAttribute("value", tier.id);
        fields.append(selectedTier);
      }
      const summary = create("div", "single-tier");
      summary.append(create("p", "price", price(tier ? tier.monthlyCents : monthlyCents, currency)));
      if (tier) summary.append(create("p", "tier-description", tier.description));
      fields.append(summary);
      return fields;
    }

    const choices = create("fieldset", "tiers");
    choices.append(create("legend", "tiers-legend", "Pick a monthly amount"));
    tiers.forEach((tier) => {
      const choice = create("label", "tier");
      const input = create("input", "tier-input");
      input.setAttribute("type", "radio");
      input.setAttribute("name", "tier");
      input.setAttribute("value", tier.id);
      input.setAttribute("required", "");
      if (tier === defaultTier) input.setAttribute("checked", "");
      const copy = create("span", "tier-copy");
      copy.append(create("span", "tier-price", price(tier.monthlyCents, currency)));
      copy.append(create("span", "tier-description", tier.description));
      choice.append(input, copy);
      choices.append(choice);
    });
    return choices;
  };

  const sponsorForm = (org, source, returnTo, tiers, monthlyCents, currency) => {
    const form = create("form", "form");
    form.setAttribute("method", "post");
    form.setAttribute("action", appOrigin + "/api/public/" + encodeURIComponent(org) + "/checkout");

    form.append(tierFields(tiers, monthlyCents, currency));

    [["sponsorName", "Your name", "text"], ["sponsorEmail", "Email address", "email"]].forEach(([name, labelText, type]) => {
      const label = create("label", "field");
      label.append(create("span", "label", labelText));
      const input = create("input", "input");
      input.setAttribute("name", name);
      input.setAttribute("type", type);
      input.setAttribute("required", "");
      if (type === "email") input.setAttribute("autocomplete", "email");
      if (type === "text") input.setAttribute("autocomplete", "name");
      label.append(input);
      form.append(label);
    });

    [["source", source], ["returnTo", returnTo]].forEach(([name, value]) => {
      const input = create("input");
      input.setAttribute("type", "hidden");
      input.setAttribute("name", name);
      input.setAttribute("value", value);
      form.append(input);
    });

    const button = create("button", "button", "Sponsor this companion");
    button.setAttribute("type", "submit");
    form.append(button);
    return form;
  };

  const styles = () => {
    const node = document.createElement("style");
    node.textContent = ".dogathon-sponsor-root{box-sizing:border-box;max-width:32rem}.dogathon-sponsor-root *{box-sizing:border-box}.dogathon-sponsor-photo{display:block;width:100%;max-height:22rem;object-fit:cover;border-radius:.7rem}.dogathon-sponsor-name{margin:.9rem 0 .2rem;font-size:1.5rem}.dogathon-sponsor-details,.dogathon-sponsor-status,.dogathon-sponsor-price{margin:.2rem 0;color:#5d554b}.dogathon-sponsor-price,.dogathon-sponsor-tier-price{font-weight:700;color:inherit}.dogathon-sponsor-intro{margin:1rem 0 0}.dogathon-sponsor-message{padding:.75rem;border-radius:.5rem;background:#f3f0ea}.dogathon-sponsor-message-success{background:#e4f3e8}.dogathon-sponsor-message-error{background:#f8e5e2}.dogathon-sponsor-root-cta .dogathon-sponsor-message{padding:0;background:none}.dogathon-sponsor-form{display:grid;gap:.8rem;margin-top:1rem}.dogathon-sponsor-tiers{display:grid;gap:.45rem;margin:0;padding:0;border:0}.dogathon-sponsor-tiers-legend{margin-bottom:.2rem;padding:0;font-weight:650}.dogathon-sponsor-tier{position:relative;display:block;padding:.75rem .9rem;border:1px solid currentColor;cursor:pointer}.dogathon-sponsor-tier:hover{background:rgba(0,0,0,.06)}.dogathon-sponsor-tier:has(.dogathon-sponsor-tier-input:checked){background:currentColor}.dogathon-sponsor-tier:has(.dogathon-sponsor-tier-input:checked) .dogathon-sponsor-tier-copy{color:#fff}.dogathon-sponsor-tier:has(.dogathon-sponsor-tier-input:checked) .dogathon-sponsor-tier-description{color:inherit}.dogathon-sponsor-tier:has(.dogathon-sponsor-tier-input:focus-visible){outline:3px solid currentColor;outline-offset:3px}.dogathon-sponsor-tier-input{position:absolute;width:1px;height:1px;margin:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}.dogathon-sponsor-tier-copy{display:grid;gap:.15rem}.dogathon-sponsor-tier-description{margin:.2rem 0;color:#5d554b}.dogathon-sponsor-field{display:grid;gap:.25rem}.dogathon-sponsor-label{font-weight:650}.dogathon-sponsor-input{width:100%;padding:.65rem;border:1px solid #9c9388;border-radius:.4rem;font:inherit}.dogathon-sponsor-button,.dogathon-sponsor-cta{display:inline-block;padding:.6rem 1.2rem;border:1px solid currentColor;border-radius:.4rem;background:transparent;color:inherit;font:inherit;font-weight:600;line-height:1.2;text-decoration:none;cursor:pointer}.dogathon-sponsor-button:hover,.dogathon-sponsor-cta:hover{text-decoration:underline}.dogathon-sponsor-link{color:#315c3a;text-decoration:underline;text-underline-offset:.15em}";
    return node;
  };

  const render = async (root) => {
    const org = (root.getAttribute("data-sponsor-org") || "").trim();
    const ctaMode = root.getAttribute("data-sponsor-mode") === "cta";
    root.classList.toggle(PREFIX + "root", !ctaMode);
    root.classList.toggle(PREFIX + "root-cta", ctaMode);
    root.replaceChildren(styles(), message("Loading companion…", "notice"));
    try {
      const source = sourceFor(root);
      const endpoint = appOrigin + "/api/public/" + encodeURIComponent(org) + "/companion?source=" + encodeURIComponent(source);
      const response = await fetch(endpoint, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        root.classList.remove(PREFIX + "root");
        root.classList.add(PREFIX + "root-cta");
        // A sponsored companion leaves the public endpoint, so the sponsor coming
        // back from checkout lands on a 404 and still has to be thanked.
        const notice = returnMessage() || message("We could not find this companion.", "notice");
        const rosterUrl = rosterUrlFor(root);
        if (rosterUrl) {
          const roster = create("a", "cta", "See all adoptable companions");
          roster.setAttribute("href", rosterUrl);
          root.replaceChildren(styles(), notice, roster);
        } else {
          root.replaceChildren(styles(), notice);
        }
        return;
      }

      const companion = await response.json();
      if (ctaMode) {
        const infoUrl = sponsorInfoUrl(root, source);
        if (infoUrl) {
          const cta = create("a", "cta", "Sponsor " + companion.name);
          cta.setAttribute("href", infoUrl);
          root.replaceChildren(styles(), cta);
        } else {
          console.warn("Dogathon sponsor CTA requires data-sponsor-info-url.");
          root.replaceChildren();
        }
        return;
      }
      const content = document.createDocumentFragment();
      content.append(styles());
      if (companion.photoUrl && !isHidden(root, "photo")) {
        const photo = create("img", "photo");
        photo.setAttribute("src", companion.photoUrl);
        photo.setAttribute("alt", companion.name);
        content.append(photo);
      }
      if (!isHidden(root, "name")) {
        content.append(create("h2", "name", companion.name));
      }
      if (!isHidden(root, "details")) {
        content.append(create("p", "details", [companion.breed, companion.ageText, companion.sex].filter(Boolean).join(" · ")));
      }
      const returned = returnMessage();
      // The price otherwise only appears inside the sponsorship form, which a return state replaces.
      if (returned) {
        content.append(create("p", "price", price(companion.monthlyCents, companion.currency)));
      }
      content.append(create("p", "status", "Available for sponsorship"));

      if (returned) {
        content.append(returned);
        content.append(link(companion.companionUrl, "View companion details"));
      } else {
        const intro = sponsorIntro(root, companion.name);
        if (intro !== null) content.append(create("p", "intro", intro));
        content.append(sponsorForm(org, source, returnToFor(root), companion.tiers || [], companion.monthlyCents, companion.currency));
      }
      root.replaceChildren(content);
    } catch {
      root.replaceChildren(styles(), message("The sponsor card could not be loaded. Please try again later.", "error"));
    } finally {
      root.setAttribute("data-sponsor-rendered", "");
    }
  };

  const renderAll = () => {
    document.querySelectorAll("[data-sponsor-org]").forEach((root) => { void render(root); });
  };

  // A CMS may enqueue this script in the head, before the containers exist.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderAll, { once: true });
  } else {
    renderAll();
  }
})();`;
