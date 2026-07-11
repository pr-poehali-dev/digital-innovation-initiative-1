import { Helmet } from 'react-helmet-async';
import Deck from '@/components/presentation/Deck';

export default function AdminPresentationPage() {
  return (
    <>
      <Helmet>
        <title>Траектория — внутренняя презентация</title>
      </Helmet>
      <Deck internal={true} />
    </>
  );
}
