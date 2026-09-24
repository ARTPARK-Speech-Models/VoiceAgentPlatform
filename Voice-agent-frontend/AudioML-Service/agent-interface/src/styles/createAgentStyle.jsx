export const CA_CSS = `
  @keyframes ca-hero-shimmer {
    0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}
  }
  @keyframes ca-slide-down {
    from{opacity:0;transform:translateY(-10px)}
    to{opacity:1;transform:translateY(0)}
  }
  @keyframes ca-tick-pop {
    0%{transform:scale(0) rotate(-20deg);opacity:0}
    60%{transform:scale(1.25) rotate(4deg);opacity:1}
    100%{transform:scale(1) rotate(0deg);opacity:1}
  }
  @keyframes ca-config-open {
    from{opacity:0;transform:translateY(-8px)}
    to{opacity:1;transform:translateY(0)}
  }
  @keyframes ca-gear-spin {
    from{transform:rotate(0deg)}to{transform:rotate(360deg)}
  }
  @keyframes ca-badge-in {
    from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}
  }
  @keyframes ca-page-rise {
    from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}
  }
  .ca-hero {
    background:linear-gradient(135deg,#0d47a1 0%,#1565c0 30%,#0277bd 60%,#01579b 100%);
    background-size:200% 200%;
    animation:ca-hero-shimmer 8s ease infinite;
  }
  .ca-page-rise { animation:ca-page-rise .45s cubic-bezier(.34,1.1,.64,1) both; }
  .ca-tick-pop  { animation:ca-tick-pop .32s cubic-bezier(.34,1.56,.64,1) both; }
  .ca-badge-in  { animation:ca-badge-in .28s cubic-bezier(.34,1.56,.64,1) both; }
  .ca-config-open { animation:ca-config-open .28s ease both; }
  .ca-gear-spin { animation:ca-gear-spin .6s linear; }
`;