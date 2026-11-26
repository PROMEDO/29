/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Cloud,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Compass,
  Droplets,
  MapPin,
  Moon,
  RefreshCw,
  Sun,
  Users,
  Wind,
} from 'lucide-react';
import { Session, StaffPermissions } from '../../types';
import type { AdminTabId } from '../../utils/router';
import { dashSectionMotion } from '../../utils/dashboardMotion';
import { fetchAdminVisitorStatsApi } from '../../utils/adminApi';

interface AdminHomeLoungeProps {
  session?: Session;
  staffPerms?: StaffPermissions;
  isSuperAdmin?: boolean;
  pageTitle?: string;
  onSelectTab?: (tab: AdminTabId) => void;
  showToast?: (msg: string) => void;
}

interface WeatherState {
  loading: boolean;
  error: string | null;
  city: string;
  country: string;
  temperature: number | null;
  apparentTemp: number | null;
  humidity: number | null;
  windSpeed: number | null;
  weatherCode: number | null;
  isDay: boolean;
  source: 'gps' | 'ip' | null;
}

function describeWeatherCode(code: number | null, isDay: boolean): {
  label: string;
  Icon: React.ElementType;
  accent: string;
} {
  if (code === null) {
    return { label: '—', Icon: isDay ? Sun : Moon, accent: '#fbbf24' };
  }
  if (code === 0) {
    return {
      label: isDay ? 'سماء صافية ومشمسة' : 'سماء صافية',
      Icon: isDay ? Sun : Moon,
      accent: isDay ? '#f59e0b' : '#93c5fd',
    };
  }
  if (code === 1 || code === 2) {
    return {
      label: 'غائم جزئياً',
      Icon: CloudSun,
      accent: '#fbbf24',
    };
  }
  if (code === 3) {
    return {
      label: 'غائم',
      Icon: Cloud,
      accent: '#94a3b8',
    };
  }
  if (code === 45 || code === 48) {
    return {
      label: 'ضباب أو غبار خفيف',
      Icon: CloudFog,
      accent: '#94a3b8',
    };
  }
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return {
      label: code >= 63 || code >= 81 ? 'أمطار متوسطة إلى غزيرة' : 'أمطار خفيفة / رذاذ',
      Icon: CloudRain,
      accent: '#38bdf8',
    };
  }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return {
      label: 'تساقط ثلوج',
      Icon: CloudSnow,
      accent: '#bae6fd',
    };
  }
  if (code >= 95 && code <= 99) {
    return {
      label: 'عاصفة رعدية',
      Icon: CloudLightning,
      accent: '#facc15',
    };
  }
  return {
    label: 'طقس متقلب',
    Icon: Cloud,
    accent: '#94a3b8',
  };
}

const timeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
});
const dateFormatter = new Intl.DateTimeFormat('ar-u-nu-latn', {
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

const LiveLoungeClock: React.FC<{ prefersReducedMotion: boolean | null }> = React.memo(
  ({ prefersReducedMotion }) => {
    const [now, setNow] = useState<Date>(() => new Date());

    useEffect(() => {
      const id = setInterval(() => {
        if (typeof document === 'undefined' || document.visibilityState === 'visible') {
          setNow(new Date());
        }
      }, 1000);
      return () => clearInterval(id);
    }, []);

    const localTimeFormatted = timeFormatter.format(now).replace('AM', 'ص').replace('PM', 'م');
    const localDateFormatted = dateFormatter.format(now);

    return (
      <motion.div
        {...dashSectionMotion(prefersReducedMotion, 0)}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}
      >
        <div
          className="muted"
          style={{
            fontSize: '15px',
            fontWeight: 600,
            letterSpacing: '0.2px',
          }}
        >
          {localDateFormatted}
        </div>

        <div
          className="tabular-nums"
          dir="ltr"
          style={{
            fontSize: 'clamp(40px, 7vw, 58px)',
            fontWeight: 800,
            color: 'var(--ink)',
            lineHeight: 1.05,
            letterSpacing: '-0.02em',
          }}
        >
          {localTimeFormatted}
        </div>
      </motion.div>
    );
  }
);

export const AdminHomeLounge: React.FC<AdminHomeLoungeProps> = () => {
  const prefersReducedMotion = useReducedMotion();
  const [weather, setWeather] = useState<WeatherState>({
    loading: true,
    error: null,
    city: '',
    country: '',
    temperature: null,
    apparentTemp: null,
    humidity: null,
    windSpeed: null,
    weatherCode: null,
    isDay: true,
    source: null,
  });

  const [visitorStats, setVisitorStats] = useState<{
    loading: boolean;
    last24h: number | null;
    total: number | null;
  }>({
    loading: true,
    last24h: null,
    total: null,
  });

  const loadVisitorStats = useCallback(async (silent = false) => {
    if (!silent) {
      setVisitorStats((prev) => ({ ...prev, loading: true }));
    }
    try {
      const data = await fetchAdminVisitorStatsApi();
      setVisitorStats({
        loading: false,
        last24h: Number.isFinite(data.last24h) ? data.last24h : 0,
        total: Number.isFinite(data.total) ? data.total : 0,
      });
    } catch {
      setVisitorStats((prev) => ({ ...prev, loading: false }));
    }
  }, []);

  useEffect(() => {
    void loadVisitorStats(false);
    const id = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        void loadVisitorStats(true);
      }
    }, 60_000);
    return () => clearInterval(id);
  }, [loadVisitorStats]);

  const fetchWeatherForCoords = useCallback(
    async (lat: number, lon: number, fallbackCity: string, fallbackCountry: string, source: 'gps' | 'ip') => {
      let city = fallbackCity;
      let country = fallbackCountry;

      if (!city) {
        try {
          const geoRes = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&localityLanguage=ar`
          );
          if (geoRes.ok) {
            const geoData = (await geoRes.json()) as {
              city?: string;
              locality?: string;
              principalSubdivision?: string;
              countryName?: string;
            };
            city = geoData.city || geoData.locality || geoData.principalSubdivision || '';
            country = geoData.countryName || '';
          }
        } catch {
          // keep fallback city/country
        }
      }

      const wRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${encodeURIComponent(lat)}&longitude=${encodeURIComponent(lon)}&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day&timezone=auto`
      );
      if (!wRes.ok) {
        throw new Error('تعذر جلب بيانات الطقس');
      }
      const wData = (await wRes.json()) as {
        current?: {
          temperature_2m?: number;
          apparent_temperature?: number;
          relative_humidity_2m?: number;
          weather_code?: number;
          wind_speed_10m?: number;
          is_day?: number;
        };
      };

      const cur = wData.current;
      if (!cur) {
        throw new Error('بيانات الطقس غير متوفرة حالياً');
      }

      setWeather({
        loading: false,
        error: null,
        city,
        country,
        temperature: typeof cur.temperature_2m === 'number' ? Math.round(cur.temperature_2m) : null,
        apparentTemp: typeof cur.apparent_temperature === 'number' ? Math.round(cur.apparent_temperature) : null,
        humidity: typeof cur.relative_humidity_2m === 'number' ? Math.round(cur.relative_humidity_2m) : null,
        windSpeed: typeof cur.wind_speed_10m === 'number' ? Math.round(cur.wind_speed_10m) : null,
        weatherCode: typeof cur.weather_code === 'number' ? cur.weather_code : null,
        isDay: cur.is_day !== 0,
        source,
      });
    },
    []
  );

  const loadWeatherByIp = useCallback(async () => {
    // 1. Primary IP geolocation (HTTPS + CORS)
    try {
      const res = await fetch('https://ipwho.is/');
      if (res.ok) {
        const data = (await res.json()) as {
          success?: boolean;
          latitude?: number;
          longitude?: number;
          city?: string;
          country?: string;
        };
        if (data.success !== false && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
          await fetchWeatherForCoords(data.latitude, data.longitude, data.city || '', data.country || '', 'ip');
          return;
        }
      }
    } catch {
      // try fallback IP provider
    }

    // 2. Fallback IP geolocation (geojs)
    const fallbackRes = await fetch('https://get.geojs.io/v1/ip/geo.json');
    if (fallbackRes.ok) {
      const geo = (await fallbackRes.json()) as {
        latitude?: string | number;
        longitude?: string | number;
        city?: string;
        country?: string;
      };
      const lat = Number(geo.latitude);
      const lon = Number(geo.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        await fetchWeatherForCoords(lat, lon, geo.city || '', geo.country || '', 'ip');
        return;
      }
    }

    throw new Error('تعذر تحديد الموقع الجغرافي');
  }, [fetchWeatherForCoords]);

  const requestPreciseLocationWeather = useCallback(() => {
    if (!navigator.geolocation) {
      setWeather((prev) => ({ ...prev, loading: false, error: 'المتصفح لا يدعم تحديد الموقع' }));
      return;
    }
    setWeather((prev) => ({ ...prev, loading: true, error: null }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        void fetchWeatherForCoords(pos.coords.latitude, pos.coords.longitude, '', '', 'gps').catch((err) => {
          setWeather((prev) => ({
            ...prev,
            loading: false,
            error: err instanceof Error ? err.message : 'تعذر جلب الطقس',
          }));
        });
      },
      () => {
        void loadWeatherByIp().catch(() => {
          setWeather((prev) => ({
            ...prev,
            loading: false,
            error: 'يرجى السماح بالوصول إلى الموقع لعرض الطقس',
          }));
        });
      },
      { enableHighAccuracy: false, timeout: 7000, maximumAge: 300000 }
    );
  }, [fetchWeatherForCoords, loadWeatherByIp]);

  useEffect(() => {
    let active = true;

    const init = async () => {
      try {
        // Use browser geolocation immediately if permission already granted; otherwise avoid modal prompt and resolve via opener IP first
        if (navigator.geolocation && navigator.permissions?.query) {
          const perm = await navigator.permissions.query({ name: 'geolocation' as PermissionName }).catch(() => null);
          if (perm?.state === 'granted' && active) {
            requestPreciseLocationWeather();
            return;
          }
        }
        await loadWeatherByIp();
      } catch {
        if (!active) return;
        setWeather((prev) => ({
          ...prev,
          loading: false,
          error: 'تعذر جلب حالة الطقس للموقع الحالي',
        }));
      }
    };

    void init();
    return () => {
      active = false;
    };
  }, [loadWeatherByIp, requestPreciseLocationWeather]);

  const weatherMeta = describeWeatherCode(weather.weatherCode, weather.isDay);
  const WeatherIcon = weatherMeta.Icon;
  const locationLabel = [weather.city, weather.country].filter(Boolean).join('، ') || 'موقعك الحالي';

  return (
    <div
      style={{
        minHeight: 'calc(100vh - 140px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 12px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '22px',
        }}
      >
        {/* Date & Live Local Time */}
        <LiveLoungeClock prefersReducedMotion={prefersReducedMotion} />

        {/* Clean Local Weather Card */}
        <motion.div
          className="card"
          {...dashSectionMotion(prefersReducedMotion, 0.15)}
          style={{
            width: '100%',
            padding: '22px 24px',
            borderRadius: '22px',
            background: 'var(--mp-glass-bg)',
            border: '1px solid var(--mp-glass-border)',
            boxShadow: 'var(--mp-glass-shadow)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {weather.loading ? (
            <div className="muted" style={{ padding: '14px 0', fontSize: '13.5px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <RefreshCw size={15} className="animate-spin" />
              <span>جاري تحديد الموقع وجلب حالة الطقس...</span>
            </div>
          ) : weather.error && weather.temperature === null ? (
            <div style={{ padding: '8px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <span className="muted" style={{ fontSize: '13.5px' }}>{weather.error}</span>
              <button
                type="button"
                className="btn s"
                onClick={requestPreciseLocationWeather}
                style={{ gap: '6px' }}
              >
                <Compass size={14} />
                <span>تحديد موقعي الآن</span>
              </button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'start' }}>
                  <div
                    style={{
                      width: '50px',
                      height: '50px',
                      borderRadius: '16px',
                      background: 'var(--soft)',
                      border: '1px solid var(--line)',
                      display: 'grid',
                      placeItems: 'center',
                      color: weatherMeta.accent,
                      flexShrink: 0,
                    }}
                  >
                    <WeatherIcon size={26} />
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 700, color: 'var(--ink)' }}>
                      <MapPin size={14} style={{ color: 'var(--brand-ink, var(--brand))', flexShrink: 0 }} />
                      <span>{locationLabel}</span>
                    </div>
                    <div className="muted" style={{ fontSize: '13px', marginTop: '2px' }}>
                      {weatherMeta.label}
                    </div>
                  </div>
                </div>

                <div
                  className="tabular-nums"
                  dir="ltr"
                  style={{
                    fontSize: '34px',
                    fontWeight: 900,
                    color: 'var(--ink)',
                    lineHeight: 1,
                  }}
                >
                  {weather.temperature !== null ? `${weather.temperature}°C` : '—'}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  flexWrap: 'wrap',
                  paddingTop: '12px',
                  borderTop: '1px solid var(--line)',
                  fontSize: '12.5px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  {weather.apparentTemp !== null && (
                    <span className="muted">
                      المحسوسة: <b className="tabular-nums" dir="ltr" style={{ color: 'var(--ink)' }}>{weather.apparentTemp}°C</b>
                    </span>
                  )}
                  {weather.humidity !== null && (
                    <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Droplets size={13} style={{ color: '#38bdf8' }} />
                      الرطوبة: <b className="tabular-nums" style={{ color: 'var(--ink)' }}>{weather.humidity}%</b>
                    </span>
                  )}
                  {weather.windSpeed !== null && (
                    <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Wind size={13} />
                      الرياح: <b className="tabular-nums" dir="ltr" style={{ color: 'var(--ink)' }}>{weather.windSpeed} km/h</b>
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={requestPreciseLocationWeather}
                  title="تحديث الموقع الدقيق والطقس"
                  aria-label="تحديث الموقع الدقيق والطقس"
                  style={{
                    background: 'var(--mp-glass-control)',
                    border: '1px solid var(--mp-glass-border)',
                    borderRadius: '999px',
                    padding: '5px 11px',
                    cursor: 'pointer',
                    color: 'var(--ink)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '11.5px',
                    fontWeight: 700,
                  }}
                >
                  <Compass size={12} />
                  <span>{weather.source === 'gps' ? 'تحديث' : 'تحديد دقيق'}</span>
                </button>
              </div>
            </>
          )}
        </motion.div>

        {/* Simple Unique Visitors Card (Last 24h & Total) */}
        <motion.div
          className="card"
          {...dashSectionMotion(prefersReducedMotion, 0.25)}
          style={{
            width: '100%',
            padding: '18px 22px',
            borderRadius: '22px',
            background: 'var(--mp-glass-bg)',
            border: '1px solid var(--mp-glass-border)',
            boxShadow: 'var(--mp-glass-shadow)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13.5px', fontWeight: 700, color: 'var(--ink)' }}>
              <span
                style={{
                  width: '30px',
                  height: '30px',
                  borderRadius: '12px',
                  background: 'var(--soft)',
                  border: '1px solid var(--line)',
                  display: 'grid',
                  placeItems: 'center',
                  color: 'var(--brand-ink, var(--brand))',
                  flexShrink: 0,
                }}
              >
                <Users size={15} />
              </span>
              <span>زوار الموقع والمنيوات</span>
            </div>

            <button
              type="button"
              onClick={() => void loadVisitorStats(false)}
              title="تحديث عداد الزوار"
              aria-label="تحديث عداد الزوار"
              disabled={visitorStats.loading}
              style={{
                background: 'var(--mp-glass-control)',
                border: '1px solid var(--mp-glass-border)',
                borderRadius: '999px',
                padding: '5px 10px',
                cursor: visitorStats.loading ? 'default' : 'pointer',
                color: 'var(--ink)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11.5px',
                fontWeight: 700,
              }}
            >
              <RefreshCw size={12} className={visitorStats.loading ? 'animate-spin' : undefined} />
              <span>تحديث</span>
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: '10px',
            }}
          >
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '16px',
                background: 'var(--mp-glass-control)',
                border: '1px solid var(--mp-glass-border)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span className="muted" style={{ fontSize: '12px', fontWeight: 600 }}>
                آخر 24 ساعة
              </span>
              <span
                className="tabular-nums"
                dir="ltr"
                style={{
                  fontSize: '26px',
                  fontWeight: 900,
                  color: 'var(--ink)',
                  lineHeight: 1.15,
                }}
              >
                {visitorStats.last24h !== null ? visitorStats.last24h.toLocaleString('en-US') : '—'}
              </span>
            </div>

            <div
              style={{
                padding: '12px 14px',
                borderRadius: '16px',
                background: 'var(--mp-glass-control)',
                border: '1px solid var(--mp-glass-border)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <span className="muted" style={{ fontSize: '12px', fontWeight: 600 }}>
                العدد الكلي
              </span>
              <span
                className="tabular-nums"
                dir="ltr"
                style={{
                  fontSize: '26px',
                  fontWeight: 900,
                  color: 'var(--ink)',
                  lineHeight: 1.15,
                }}
              >
                {visitorStats.total !== null ? visitorStats.total.toLocaleString('en-US') : '—'}
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};
