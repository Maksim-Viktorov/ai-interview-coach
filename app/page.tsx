'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function Home() {
  useEffect(() => {
    const test = async () => {
      const { data, error } = await supabase.from('test').select('*');
      console.log('DATA:', data);
      console.log('ERROR:', error);
    };

    test();
  }, []);

  return <div>Check console</div>;
}