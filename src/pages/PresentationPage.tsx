import { Helmet } from 'react-helmet-async';
import Deck from '@/components/presentation/Deck';

export default function PresentationPage() {
  return (
    <>
      <Helmet>
        <title>Траектория — презентация продукта</title>
        <meta name="description" content="Траектория — единая система работы, обучения и профессионального роста." />
      </Helmet>
      <Deck internal={false} />
    </>
  );
}
