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

  const statusText = (status) => status === "adopted"
    ? "Adopted"
    : status === "sponsored" ? "Sponsored" : "Available for sponsorship";

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
        "rate-limited": "Too many checkout attempts. Please wait and try again.",
        unavailable: "This companion is not currently available for sponsorship.",
        billing: "Checkout is temporarily unavailable. Please try again later.",
      };
      return message(errors[errorCode] || "We could not start checkout. Please try again.", "error");
    }
    return null;
  };

  const sponsorForm = (org, source, returnTo) => {
    const form = create("form", "form");
    form.setAttribute("method", "post");
    form.setAttribute("action", appOrigin + "/api/public/" + encodeURIComponent(org) + "/checkout");

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
    node.textContent = ".dogathon-sponsor-root{box-sizing:border-box;max-width:32rem;padding:1.25rem;border:1px solid #d9d4ca;border-radius:1rem;background:#fff;color:#27231e;font:16px/1.45 system-ui,sans-serif}.dogathon-sponsor-root *{box-sizing:border-box}.dogathon-sponsor-photo{display:block;width:100%;max-height:22rem;object-fit:cover;border-radius:.7rem}.dogathon-sponsor-name{margin:.9rem 0 .2rem;font-size:1.5rem}.dogathon-sponsor-details,.dogathon-sponsor-status,.dogathon-sponsor-price{margin:.2rem 0;color:#5d554b}.dogathon-sponsor-price{font-weight:700;color:inherit}.dogathon-sponsor-intro{margin:1rem 0 0}.dogathon-sponsor-message{padding:.75rem;border-radius:.5rem;background:#f3f0ea}.dogathon-sponsor-message-success{background:#e4f3e8}.dogathon-sponsor-message-error{background:#f8e5e2}.dogathon-sponsor-form{display:grid;gap:.8rem;margin-top:1rem}.dogathon-sponsor-field{display:grid;gap:.25rem}.dogathon-sponsor-label{font-weight:650}.dogathon-sponsor-input{width:100%;padding:.65rem;border:1px solid #9c9388;border-radius:.4rem;font:inherit}.dogathon-sponsor-button{display:inline-block;padding:.75rem 1rem;border:0;border-radius:.5rem;background:#3c6442;color:#fff;font:inherit;font-weight:700;cursor:pointer;text-decoration:none}.dogathon-sponsor-cta{display:inline-block;cursor:pointer;text-decoration:none}.dogathon-sponsor-link{color:#315c3a;text-decoration:underline;text-underline-offset:.15em}";
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
        root.replaceChildren(styles(), message("We could not find this companion.", "notice"));
        return;
      }

      const companion = await response.json();
      if (ctaMode) {
        if (companion.status === "adopted") {
          root.replaceChildren(styles(), message("This companion has been adopted and is no longer accepting sponsorships.", "notice"));
        } else if (companion.status === "sponsored") {
          root.replaceChildren(styles(), message("This companion already has an active sponsor.", "notice"));
        } else {
          const infoUrl = sponsorInfoUrl(root, source);
          if (infoUrl) {
            const cta = create("a", "cta", "Sponsor " + companion.name);
            cta.setAttribute("href", infoUrl);
            root.replaceChildren(styles(), cta);
          } else {
            console.warn("Dogathon sponsor CTA requires data-sponsor-info-url.");
            root.replaceChildren();
          }
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
      content.append(create("p", "price", price(companion.monthlyCents, companion.currency)));
      content.append(create("p", "status", statusText(companion.status)));

      const returned = returnMessage();
      if (returned) {
        content.append(returned);
      } else if (companion.status === "adopted") {
        content.append(message("This companion has been adopted and is no longer accepting sponsorships.", "notice"));
      } else if (companion.status === "sponsored") {
        content.append(message("This companion already has an active sponsor.", "notice"));
      } else {
        const intro = sponsorIntro(root, companion.name);
        if (intro !== null) content.append(create("p", "intro", intro));
        content.append(sponsorForm(org, source, returnToFor(root)));
      }
      if (companion.status === "adopted" || companion.status === "sponsored") {
        content.append(link(companion.companionUrl, "View companion details"));
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
